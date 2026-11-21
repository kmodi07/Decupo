import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client";
import {
  approvals,
  artifacts,
  missions,
  missionSteps,
  notifications,
  type Approval,
  type Mission,
  type MissionStep,
} from "../db/schema";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { firstIssue } from "../auth/service";
import { release, reserve } from "../ledger/service";
import { getPlanner } from "../planner/rule-based";
import type { MissionPlan } from "../planner/types";
import { requirePermission, type TenantContext } from "../tenancy/rbac";
import { defaultWorkspaceId } from "../tenancy/context";
import { enqueue, cancelQueued, RUN_STEP } from "../jobs/queue";
import { getSkill } from "../skills/registry";
import { appendEvent } from "./events";
import { assertTransition, TERMINAL_MISSION, TERMINAL_STEP } from "./state";

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------
export const createMissionSchema = z.object({
  goal: z.string().trim().min(8, "Tell Cupi a little more about the goal").max(2000),
  answers: z.record(z.string(), z.string().max(500)).optional(),
});

export const authorizeSchema = z.object({
  budgetCeilingCredits: z.number().int().positive().optional(),
});

export const decisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(1000).optional(),
});

// ---------------------------------------------------------------------------
// Reads (always tenant-scoped)
// ---------------------------------------------------------------------------
export async function getMission(db: Db, ctx: TenantContext, missionId: string): Promise<Mission> {
  requirePermission(ctx, "mission:read");
  const [m] = await db
    .select()
    .from(missions)
    .where(and(eq(missions.id, missionId), eq(missions.orgId, ctx.orgId)))
    .limit(1);
  if (!m) throw new NotFoundError("Mission");
  return m;
}

export async function listMissions(db: Db, ctx: TenantContext, limit = 50): Promise<Mission[]> {
  requirePermission(ctx, "mission:read");
  return db.select().from(missions).where(eq(missions.orgId, ctx.orgId)).orderBy(desc(missions.createdAt)).limit(limit);
}

export async function listSteps(db: Db, ctx: TenantContext, missionId: string): Promise<MissionStep[]> {
  await getMission(db, ctx, missionId);
  return db.select().from(missionSteps).where(eq(missionSteps.missionId, missionId)).orderBy(asc(missionSteps.position));
}

export async function listArtifacts(db: Db, ctx: TenantContext, missionId: string) {
  requirePermission(ctx, "artifact:read");
  await getMission(db, ctx, missionId);
  return db.select().from(artifacts).where(eq(artifacts.missionId, missionId)).orderBy(asc(artifacts.createdAt));
}

export async function getArtifact(db: Db, ctx: TenantContext, artifactId: string) {
  requirePermission(ctx, "artifact:read");
  const [a] = await db
    .select()
    .from(artifacts)
    .where(and(eq(artifacts.id, artifactId), eq(artifacts.orgId, ctx.orgId)))
    .limit(1);
  if (!a) throw new NotFoundError("Artifact");
  return a;
}

export async function listApprovals(db: Db, ctx: TenantContext, opts: { missionId?: string; status?: Approval["status"] } = {}) {
  requirePermission(ctx, "mission:read");
  const conds = [eq(approvals.orgId, ctx.orgId)];
  if (opts.missionId) conds.push(eq(approvals.missionId, opts.missionId));
  if (opts.status) conds.push(eq(approvals.status, opts.status));
  return db
    .select()
    .from(approvals)
    .where(and(...conds))
    .orderBy(desc(approvals.createdAt));
}

// ---------------------------------------------------------------------------
// Create + plan + estimate
// ---------------------------------------------------------------------------
export async function createMission(db: Db, ctx: TenantContext, raw: unknown): Promise<{ mission: Mission; plan: MissionPlan }> {
  requirePermission(ctx, "mission:create");
  const parsed = createMissionSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(firstIssue(parsed.error.issues, "Invalid mission"), { issues: parsed.error.issues });
  const { goal, answers } = parsed.data;
  const workspaceId = await defaultWorkspaceId(db, ctx);
  const plan = await getPlanner().plan({ goal, answers });
  const missingRequired = plan.questions.filter((q) => q.required && !answers?.[q.key]);
  const status = missingRequired.length ? "estimated" : "awaiting_authorization";

  return db.transaction(async (tx) => {
    const [m] = await tx
      .insert(missions)
      .values({
        orgId: ctx.orgId,
        workspaceId,
        createdBy: ctx.userId,
        title: plan.title,
        goal,
        status,
        plan: plan as unknown as Record<string, unknown>,
        estimateCredits: plan.estimateCredits,
      })
      .returning();
    const mission = m!;
    await tx.insert(missionSteps).values(
      plan.steps.map((s, i) => {
        const skill = getSkill(s.skillId);
        return {
          orgId: ctx.orgId,
          missionId: mission.id,
          key: s.key,
          title: s.title,
          agent: s.agent,
          skillId: s.skillId,
          skillVersion: skill.manifest.version,
          dependsOn: s.dependsOn,
          position: i,
          input: s.input,
          estimatedCredits: s.estimatedCredits,
          maxAttempts: skill.manifest.maxAttempts,
          requiresApproval: s.requiresApproval,
          actionClass: s.actionClass,
        };
      }),
    );
    await appendEvent(tx, { orgId: ctx.orgId, missionId: mission.id, type: "mission.created", actor: `user:${ctx.userId}`, payload: { goal } });
    await appendEvent(tx, {
      orgId: ctx.orgId,
      missionId: mission.id,
      type: "mission.estimated",
      actor: "agent:Cupi",
      payload: { estimateCredits: plan.estimateCredits, team: plan.team, templateId: plan.templateId, stepCount: plan.steps.length },
    });
    return { mission, plan };
  });
}

// ---------------------------------------------------------------------------
// Authorise: reserve credits, enqueue root steps
// ---------------------------------------------------------------------------
export async function authorizeMission(db: Db, ctx: TenantContext, missionId: string, raw: unknown = {}): Promise<Mission> {
  requirePermission(ctx, "mission:authorize");
  const parsed = authorizeSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError("Invalid authorisation", { issues: parsed.error.issues });
  const m = await getMission(db, ctx, missionId);
  if (m.status !== "awaiting_authorization" && m.status !== "estimated") assertTransition(m.status, "queued");
  const ceiling = parsed.data.budgetCeilingCredits ?? m.estimateCredits;
  if (ceiling < m.estimateCredits) throw new ValidationError(`Budget ceiling must be at least the estimate (${m.estimateCredits} credits)`);

  // Reserve outside the mission transaction so a credit failure leaves the mission untouched.
  const r = await reserve(db, {
    orgId: ctx.orgId,
    missionId,
    amount: ceiling,
    idempotencyKey: `mission-reserve:${missionId}`,
    description: `Reserved for "${m.title}"`,
  });

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(missions)
      .set({ status: "queued", reservationId: r.reservationId, budgetCeilingCredits: ceiling, authorizedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(missions.id, missionId), eq(missions.orgId, ctx.orgId), inArray(missions.status, ["awaiting_authorization", "estimated"])))
      .returning();
    if (!row) throw new ConflictError("Mission was already authorised or changed state");
    await appendEvent(tx, {
      orgId: ctx.orgId,
      missionId,
      type: "mission.authorized",
      actor: `user:${ctx.userId}`,
      payload: { budgetCeilingCredits: ceiling, reservationId: r.reservationId },
    });
    return row;
  });
  await scheduleReadySteps(db, missionId);
  return updated;
}

// ---------------------------------------------------------------------------
// Pause / resume / cancel
// ---------------------------------------------------------------------------
export async function pauseMission(db: Db, ctx: TenantContext, missionId: string, reason?: string): Promise<Mission> {
  requirePermission(ctx, "mission:control");
  const m = await getMission(db, ctx, missionId);
  assertTransition(m.status, "paused");
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(missions)
      .set({ status: "paused", pausedReason: reason ?? null, updatedAt: new Date() })
      .where(eq(missions.id, missionId))
      .returning();
    const ready = await tx
      .select({ id: missionSteps.id })
      .from(missionSteps)
      .where(and(eq(missionSteps.missionId, missionId), eq(missionSteps.status, "ready")));
    await cancelQueued(tx, { orgId: ctx.orgId, stepIds: ready.map((s) => s.id) });
    await appendEvent(tx, { orgId: ctx.orgId, missionId, type: "mission.paused", actor: `user:${ctx.userId}`, payload: { reason: reason ?? null } });
    return row!;
  });
}

export async function resumeMission(db: Db, ctx: TenantContext, missionId: string): Promise<Mission> {
  requirePermission(ctx, "mission:control");
  const m = await getMission(db, ctx, missionId);
  assertTransition(m.status, "queued");
  const row = await db.transaction(async (tx) => {
    const [r] = await tx.update(missions).set({ status: "queued", pausedReason: null, updatedAt: new Date() }).where(eq(missions.id, missionId)).returning();
    await appendEvent(tx, { orgId: ctx.orgId, missionId, type: "mission.resumed", actor: `user:${ctx.userId}` });
    return r!;
  });
  const ready = await db
    .select()
    .from(missionSteps)
    .where(and(eq(missionSteps.missionId, missionId), eq(missionSteps.status, "ready")));
  for (const s of ready) await enqueueStep(db, s, `resume:${Date.now()}`);
  await scheduleReadySteps(db, missionId);
  return row;
}

export async function cancelMission(db: Db, ctx: TenantContext, missionId: string, reason?: string): Promise<Mission> {
  requirePermission(ctx, "mission:control");
  const m = await getMission(db, ctx, missionId);
  assertTransition(m.status, "canceled");
  const row = await db.transaction(async (tx) => {
    const now = new Date();
    const [r] = await tx
      .update(missions)
      .set({ status: "canceled", finishedAt: now, updatedAt: now, summary: reason ? `Canceled: ${reason}` : "Canceled by user" })
      .where(eq(missions.id, missionId))
      .returning();
    const open = await tx
      .update(missionSteps)
      .set({ status: "canceled", finishedAt: now, updatedAt: now })
      .where(and(eq(missionSteps.missionId, missionId), inArray(missionSteps.status, ["pending", "ready", "awaiting_approval"])))
      .returning({ id: missionSteps.id });
    await cancelQueued(tx, { orgId: ctx.orgId, stepIds: open.map((s) => s.id) });
    await tx
      .update(approvals)
      .set({ status: "expired", decidedAt: now })
      .where(and(eq(approvals.missionId, missionId), eq(approvals.status, "pending")));
    await appendEvent(tx, { orgId: ctx.orgId, missionId, type: "mission.canceled", actor: `user:${ctx.userId}`, payload: { reason: reason ?? null } });
    return r!;
  });
  if (row.reservationId) {
    const rel = await release(db, { orgId: ctx.orgId, missionId, reservationId: row.reservationId, idempotencyKey: `mission-release:${missionId}` });
    if (rel.released > 0) {
      await appendEvent(db, { orgId: ctx.orgId, missionId, type: "credits.released", actor: "system", payload: { credits: rel.released } });
    }
  }
  return row;
}

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------
export async function decideApproval(db: Db, ctx: TenantContext, approvalId: string, raw: unknown): Promise<Approval> {
  requirePermission(ctx, "approval:decide");
  const parsed = decisionSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError("Invalid decision", { issues: parsed.error.issues });
  const { decision, note } = parsed.data;
  const [a] = await db
    .select()
    .from(approvals)
    .where(and(eq(approvals.id, approvalId), eq(approvals.orgId, ctx.orgId)))
    .limit(1);
  if (!a) throw new NotFoundError("Approval");
  if (a.status !== "pending") throw new ConflictError(`Approval already ${a.status}`);

  const updated = await db.transaction(async (tx) => {
    const now = new Date();
    const [row] = await tx
      .update(approvals)
      .set({ status: decision, decidedAt: now, decidedBy: ctx.userId, decisionNote: note ?? null })
      .where(and(eq(approvals.id, approvalId), eq(approvals.status, "pending")))
      .returning();
    if (!row) throw new ConflictError("Approval was decided concurrently");
    if (a.stepId) {
      await tx
        .update(missionSteps)
        .set(
          decision === "approved"
            ? { status: "ready", updatedAt: now }
            : { status: "skipped", error: `Rejected by user${note ? `: ${note}` : ""}`, finishedAt: now, updatedAt: now },
        )
        .where(and(eq(missionSteps.id, a.stepId), eq(missionSteps.status, "awaiting_approval")));
    }
    await appendEvent(tx, {
      orgId: ctx.orgId,
      missionId: a.missionId,
      type: `approval.${decision}`,
      actor: `user:${ctx.userId}`,
      payload: { approvalId, stepId: a.stepId, actionClass: a.actionClass, note: note ?? null },
    });
    return row;
  });

  if (decision === "approved" && a.stepId) {
    const [step] = await db.select().from(missionSteps).where(eq(missionSteps.id, a.stepId)).limit(1);
    if (step?.status === "ready") {
      // Bring a paused-for-review mission back into the queue.
      await db
        .update(missions)
        .set({ status: "queued", updatedAt: new Date() })
        .where(and(eq(missions.id, a.missionId), eq(missions.status, "awaiting_review")));
      await enqueueStep(db, step, `approved:${approvalId}`);
    }
  }
  await scheduleReadySteps(db, a.missionId);
  await evaluateMission(db, a.missionId);
  return updated;
}

// ---------------------------------------------------------------------------
// Scheduling (used by authorize, approvals and the worker)
// ---------------------------------------------------------------------------
export async function enqueueStep(db: Db, step: MissionStep, nonce?: string) {
  return enqueue(db, {
    orgId: step.orgId,
    kind: RUN_STEP,
    payload: { stepId: step.id, missionId: step.missionId },
    idempotencyKey: `${RUN_STEP}:${step.id}:${nonce ?? step.attempts}`,
    maxAttempts: step.maxAttempts,
  });
}

/**
 * Move pending steps whose dependencies all succeeded to `ready` (enqueue) or
 * `awaiting_approval` (create approval). Steps with a failed/blocked/skipped
 * dependency are skipped so the mission can finish honestly.
 */
export async function scheduleReadySteps(db: Db, missionId: string): Promise<void> {
  const [mission] = await db.select().from(missions).where(eq(missions.id, missionId)).limit(1);
  if (!mission || !["queued", "running", "awaiting_review"].includes(mission.status)) return;

  let changed = true;
  while (changed) {
    changed = false;
    const steps = await db.select().from(missionSteps).where(eq(missionSteps.missionId, missionId));
    const byKey = new Map(steps.map((s) => [s.key, s]));
    for (const step of steps) {
      if (step.status !== "pending") continue;
      const deps = step.dependsOn.map((k) => byKey.get(k));
      if (deps.some((d) => !d)) throw new Error(`Step ${step.key} depends on unknown step`);
      if (deps.some((d) => d!.status !== "succeeded" && TERMINAL_STEP.has(d!.status))) {
        const bad = deps.find((d) => d!.status !== "succeeded" && TERMINAL_STEP.has(d!.status))!;
        await db
          .update(missionSteps)
          .set({ status: "skipped", error: `Upstream step "${bad.title}" ${bad.status}`, finishedAt: new Date(), updatedAt: new Date() })
          .where(and(eq(missionSteps.id, step.id), eq(missionSteps.status, "pending")));
        await appendEvent(db, {
          orgId: step.orgId,
          missionId,
          type: "step.skipped",
          actor: "system",
          payload: { stepId: step.id, key: step.key, reason: `upstream ${bad.key} ${bad.status}` },
        });
        changed = true;
        continue;
      }
      if (!deps.every((d) => d!.status === "succeeded")) continue;

      if (step.requiresApproval) {
        const skill = getSkill(step.skillId);
        await db.transaction(async (tx) => {
          const [upd] = await tx
            .update(missionSteps)
            .set({ status: "awaiting_approval", updatedAt: new Date() })
            .where(and(eq(missionSteps.id, step.id), eq(missionSteps.status, "pending")))
            .returning();
          if (!upd) return;
          const [appr] = await tx
            .insert(approvals)
            .values({
              orgId: step.orgId,
              missionId,
              stepId: step.id,
              actionClass: step.actionClass ?? skill.manifest.actionClass,
              title: `Approve: ${step.title}`,
              description: skill.manifest.description,
            })
            .returning();
          await appendEvent(tx, {
            orgId: step.orgId,
            missionId,
            type: "approval.requested",
            actor: `agent:${step.agent}`,
            payload: { approvalId: appr!.id, stepId: step.id, key: step.key, actionClass: appr!.actionClass },
          });
          await tx.insert(notifications).values({
            orgId: step.orgId,
            userId: mission.createdBy,
            missionId,
            type: "approval.requested",
            title: `Approval needed: ${step.title}`,
            body: skill.manifest.description,
          });
        });
      } else {
        const [upd] = await db
          .update(missionSteps)
          .set({ status: "ready", updatedAt: new Date() })
          .where(and(eq(missionSteps.id, step.id), eq(missionSteps.status, "pending")))
          .returning();
        if (upd) {
          await enqueueStep(db, upd);
          await appendEvent(db, { orgId: step.orgId, missionId, type: "step.ready", actor: "system", payload: { stepId: step.id, key: step.key } });
        }
      }
      changed = true;
    }
  }
  await evaluateMission(db, missionId);
}

/**
 * Derive the mission status from its steps. Terminal when every step is
 * terminal; `awaiting_review` when only approvals remain; otherwise unchanged.
 */
export async function evaluateMission(db: Db, missionId: string): Promise<Mission | null> {
  const [mission] = await db.select().from(missions).where(eq(missions.id, missionId)).limit(1);
  if (!mission || TERMINAL_MISSION.has(mission.status) || mission.status === "paused") return mission ?? null;
  if (!["queued", "running", "awaiting_review"].includes(mission.status)) return mission;
  const steps = await db.select().from(missionSteps).where(eq(missionSteps.missionId, missionId));
  if (steps.length === 0) return mission;

  const allTerminal = steps.every((s) => TERMINAL_STEP.has(s.status));
  if (!allTerminal) {
    const anyActive = steps.some((s) => s.status === "ready" || s.status === "running");
    const anyApproval = steps.some((s) => s.status === "awaiting_approval");
    if (!anyActive && anyApproval && mission.status !== "awaiting_review") {
      const [row] = await db.update(missions).set({ status: "awaiting_review", updatedAt: new Date() }).where(eq(missions.id, missionId)).returning();
      await appendEvent(db, { orgId: mission.orgId, missionId, type: "mission.awaiting_review", actor: "agent:Cupi" });
      return row!;
    }
    return mission;
  }

  const succeeded = steps.filter((s) => s.status === "succeeded").length;
  const blocked = steps.filter((s) => s.status === "blocked").length;
  const failed = steps.filter((s) => s.status === "failed").length;
  const skipped = steps.filter((s) => s.status === "skipped" || s.status === "canceled").length;
  const final: Mission["status"] = succeeded === steps.length ? "completed" : succeeded === 0 ? "failed" : "partially_completed";
  const parts = [`${succeeded}/${steps.length} steps done`];
  if (blocked) parts.push(`${blocked} blocked`);
  if (failed) parts.push(`${failed} failed`);
  if (skipped) parts.push(`${skipped} skipped`);
  const summary = parts.join(", ");

  const now = new Date();
  const [row] = await db
    .update(missions)
    .set({ status: final, finishedAt: now, updatedAt: now, summary })
    .where(and(eq(missions.id, missionId), inArray(missions.status, ["queued", "running", "awaiting_review"])))
    .returning();
  if (!row) return mission;
  await appendEvent(db, { orgId: mission.orgId, missionId, type: `mission.${final}`, actor: "agent:Cupi", payload: { summary } });
  if (row.reservationId) {
    const rel = await release(db, { orgId: mission.orgId, missionId, reservationId: row.reservationId, idempotencyKey: `mission-release:${missionId}` });
    if (rel.released > 0) {
      await appendEvent(db, { orgId: mission.orgId, missionId, type: "credits.released", actor: "system", payload: { credits: rel.released } });
    }
  }
  await db.insert(notifications).values({
    orgId: mission.orgId,
    userId: mission.createdBy,
    missionId,
    type: `mission.${final}`,
    title: `${mission.title}: ${final.replace("_", " ")}`,
    body: summary,
  });
  return row;
}
