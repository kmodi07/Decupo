import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Db } from "../db/client";
import { artifacts, authConnections, missions, missionSteps, providerCosts, toolInvocations, type Job, type MissionStep } from "../db/schema";
import { claim, complete, fail, RUN_STEP } from "../jobs/queue";
import { reservationRemaining, settle } from "../ledger/service";
import { getLlmProvider } from "../llm";
import { appendEvent } from "../missions/events";
import { evaluateMission, scheduleReadySteps } from "../missions/service";
import { getSkill } from "../skills/registry";
import type { SkillContext, SkillResult, SkillUsage } from "../skills/types";

export type WorkerOptions = {
  workerId?: string;
  leaseMs?: number;
  /** Test hook: override the skill timeout. */
  timeoutMs?: number;
};

/** Claim and process one job. Returns false when the queue is empty. */
export async function runOnce(db: Db, opts: WorkerOptions = {}): Promise<boolean> {
  const workerId = opts.workerId ?? `worker-${process.pid}`;
  const leaseMs = opts.leaseMs ?? Number(process.env.WORKER_LEASE_MS ?? 60_000);
  const job = await claim(db, workerId, leaseMs);
  if (!job) return false;
  try {
    if (job.kind === RUN_STEP) await runStepJob(db, job, opts);
    else throw new Error(`Unknown job kind ${job.kind}`);
  } catch (err) {
    // Unexpected infrastructure error (not a skill failure): retry the job.
    await fail(db, job, String((err as Error).stack ?? err));
  }
  return true;
}

/** Process jobs until the queue is empty (tests) or `maxJobs` is reached. */
export async function drain(db: Db, opts: WorkerOptions & { maxJobs?: number } = {}): Promise<number> {
  let n = 0;
  const max = opts.maxJobs ?? 1000;
  while (n < max && (await runOnce(db, opts))) n += 1;
  return n;
}

/** Long-running loop for the worker process. */
export async function runForever(db: Db, opts: WorkerOptions & { pollMs?: number; signal?: AbortSignal } = {}) {
  const pollMs = opts.pollMs ?? Number(process.env.WORKER_POLL_MS ?? 1000);
  while (!opts.signal?.aborted) {
    let worked = false;
    try {
      worked = await runOnce(db, opts);
    } catch (err) {
      console.error("[worker] loop error", err);
    }
    if (!worked) await new Promise((r) => setTimeout(r, pollMs));
  }
}

// ---------------------------------------------------------------------------
async function runStepJob(db: Db, job: Job, opts: WorkerOptions) {
  const stepId = String(job.payload.stepId ?? "");
  const [step] = await db.select().from(missionSteps).where(eq(missionSteps.id, stepId)).limit(1);
  if (!step || step.status !== "ready") {
    await complete(db, job.id); // stale wake-up; the step moved on
    return;
  }
  const [mission] = await db.select().from(missions).where(eq(missions.id, step.missionId)).limit(1);
  if (!mission) {
    await complete(db, job.id);
    return;
  }
  if (mission.status === "paused") {
    await complete(db, job.id); // resume() re-enqueues ready steps
    return;
  }
  if (mission.status === "canceled" || !["queued", "running", "awaiting_review"].includes(mission.status)) {
    await db.update(missionSteps).set({ status: "canceled", finishedAt: new Date(), updatedAt: new Date() }).where(eq(missionSteps.id, step.id));
    await complete(db, job.id);
    return;
  }

  // Budget ceiling: refuse to start a step the reservation cannot cover.
  if (mission.reservationId) {
    const remaining = await reservationRemaining(db, mission.reservationId);
    if (remaining < step.estimatedCredits) {
      await finishStep(db, step, {
        status: "blocked",
        error: `Budget ceiling reached: step needs about ${step.estimatedCredits} credits, ${remaining} remain reserved.`,
      });
      await complete(db, job.id);
      await afterStep(db, step.missionId);
      return;
    }
  }

  // Mark running.
  const [running] = await db
    .update(missionSteps)
    .set({ status: "running", attempts: sql`${missionSteps.attempts} + 1`, startedAt: new Date(), updatedAt: new Date(), error: null })
    .where(and(eq(missionSteps.id, step.id), eq(missionSteps.status, "ready")))
    .returning();
  if (!running) {
    await complete(db, job.id);
    return;
  }
  if (mission.status === "queued") {
    await db.update(missions).set({ status: "running", updatedAt: new Date() }).where(and(eq(missions.id, mission.id), eq(missions.status, "queued")));
    await appendEvent(db, { orgId: mission.orgId, missionId: mission.id, type: "mission.started", actor: "agent:Cupi" });
  }
  await appendEvent(db, {
    orgId: step.orgId,
    missionId: step.missionId,
    type: "step.started",
    actor: `agent:${step.agent}`,
    payload: { stepId: step.id, key: step.key, attempt: running.attempts, skillId: step.skillId },
  });

  const skill = getSkill(step.skillId);
  const usage: SkillUsage[] = [];
  const ctx = await buildContext(db, running, mission.goal, usage);
  const timeoutMs = opts.timeoutMs ?? skill.manifest.timeoutMs;

  let result: SkillResult;
  try {
    result = await withTimeout(skill.run(ctx), timeoutMs, `Skill ${skill.manifest.id} timed out after ${timeoutMs}ms`);
  } catch (err) {
    const message = String((err as Error).message ?? err);
    if (running.attempts < running.maxAttempts) {
      await db.update(missionSteps).set({ status: "ready", error: message, updatedAt: new Date() }).where(eq(missionSteps.id, step.id));
      await appendEvent(db, {
        orgId: step.orgId,
        missionId: step.missionId,
        type: "step.retrying",
        actor: "system",
        payload: { stepId: step.id, key: step.key, attempt: running.attempts, error: message },
      });
      await fail(db, { ...job, maxAttempts: Math.max(job.maxAttempts, running.maxAttempts) }, message);
      return;
    }
    await finishStep(db, running, { status: "failed", error: message });
    await complete(db, job.id);
    await afterStep(db, step.missionId);
    return;
  }

  // Settle credits for what was actually used.
  const tokens = usage.filter((u) => u.unit === "tokens").reduce((s, u) => s + u.quantity, 0);
  const creditsUsed = skill.manifest.cost.baseCredits + Math.ceil((tokens / 1000) * skill.manifest.cost.creditsPerThousandTokens);
  let settled = 0;
  let overage = 0;
  if (mission.reservationId) {
    const s = await settle(db, {
      orgId: step.orgId,
      missionId: step.missionId,
      reservationId: mission.reservationId,
      amount: creditsUsed,
      idempotencyKey: `settle:${step.id}:${running.attempts}`,
      description: `${step.title} (${skill.manifest.id})`,
      metadata: { stepId: step.id, tokens },
    });
    settled = s.settled;
    overage = s.overage;
  }

  if (result.status === "blocked") {
    await finishStep(db, running, { status: "blocked", error: result.reason, output: result.output ?? null, actualCredits: settled });
  } else {
    await finishStep(db, running, { status: "succeeded", output: result.output, actualCredits: settled, summary: result.summary });
  }
  await db
    .update(missions)
    .set({ settledCredits: sql`${missions.settledCredits} + ${settled}`, updatedAt: new Date() })
    .where(eq(missions.id, mission.id));
  if (overage > 0) {
    await appendEvent(db, {
      orgId: step.orgId,
      missionId: step.missionId,
      type: "budget.overage",
      actor: "system",
      payload: { stepId: step.id, key: step.key, requested: creditsUsed, settled, overage },
    });
  }
  await complete(db, job.id);
  await afterStep(db, step.missionId);
}

async function afterStep(db: Db, missionId: string) {
  await scheduleReadySteps(db, missionId);
  await evaluateMission(db, missionId);
}

async function finishStep(
  db: Db,
  step: MissionStep,
  r: { status: "succeeded" | "failed" | "blocked"; error?: string; output?: Record<string, unknown> | null; actualCredits?: number; summary?: string },
) {
  const now = new Date();
  await db
    .update(missionSteps)
    .set({ status: r.status, error: r.error ?? null, output: r.output ?? null, actualCredits: r.actualCredits ?? 0, finishedAt: now, updatedAt: now })
    .where(eq(missionSteps.id, step.id));
  await appendEvent(db, {
    orgId: step.orgId,
    missionId: step.missionId,
    type: `step.${r.status}`,
    actor: `agent:${step.agent}`,
    payload: { stepId: step.id, key: step.key, credits: r.actualCredits ?? 0, summary: r.summary ?? null, error: r.error ?? null },
  });
}

async function buildContext(db: Db, step: MissionStep, goal: string, usage: SkillUsage[]): Promise<SkillContext> {
  const siblings = await db.select().from(missionSteps).where(eq(missionSteps.missionId, step.missionId));
  const upstream: Record<string, Record<string, unknown>> = {};
  for (const s of siblings) if (s.key !== step.key && s.status === "succeeded" && s.output) upstream[s.key] = s.output;

  return {
    orgId: step.orgId,
    missionId: step.missionId,
    stepId: step.id,
    stepKey: step.key,
    goal,
    input: step.input,
    upstream,
    llm: getLlmProvider(),
    async once<T>(key: string, tool: string, fn: () => Promise<T>): Promise<T> {
      const [prior] = await db
        .select()
        .from(toolInvocations)
        .where(and(eq(toolInvocations.stepId, step.id), eq(toolInvocations.key, key)))
        .limit(1);
      if (prior?.status === "succeeded") return prior.output as T;
      try {
        const out = await fn();
        await db
          .insert(toolInvocations)
          .values({ orgId: step.orgId, missionId: step.missionId, stepId: step.id, key, tool, status: "succeeded", output: out as unknown })
          .onConflictDoUpdate({ target: [toolInvocations.stepId, toolInvocations.key], set: { status: "succeeded", output: out as unknown, error: null } });
        return out;
      } catch (err) {
        const error = String((err as Error).message ?? err);
        await db
          .insert(toolInvocations)
          .values({ orgId: step.orgId, missionId: step.missionId, stepId: step.id, key, tool, status: "failed", error })
          .onConflictDoUpdate({ target: [toolInvocations.stepId, toolInvocations.key], set: { status: "failed", error } });
        throw err;
      }
    },
    async writeArtifact(a) {
      const mime = a.kind === "markdown" ? "text/markdown" : a.kind === "json" ? "application/json" : "text/html";
      const [row] = await db
        .insert(artifacts)
        .values({
          orgId: step.orgId,
          missionId: step.missionId,
          stepId: step.id,
          kind: a.kind,
          title: a.title,
          mimeType: mime,
          contentText: a.content,
          sizeBytes: Buffer.byteLength(a.content, "utf8"),
          producedBy: step.agent,
        })
        .returning();
      await appendEvent(db, {
        orgId: step.orgId,
        missionId: step.missionId,
        type: "artifact.created",
        actor: `agent:${step.agent}`,
        payload: { artifactId: row!.id, title: a.title, kind: a.kind, stepId: step.id },
      });
      return row!;
    },
    async recordUsage(u) {
      usage.push(u);
      await db.insert(providerCosts).values({
        orgId: step.orgId,
        missionId: step.missionId,
        stepId: step.id,
        provider: u.provider,
        sku: u.sku,
        unit: u.unit,
        quantity: u.quantity,
        costMicrosUsd: null, // operator rate table not configured (see cost_rates)
        credits: 0,
      });
    },
    async log(message, payload) {
      await appendEvent(db, {
        orgId: step.orgId,
        missionId: step.missionId,
        type: "step.log",
        actor: `agent:${step.agent}`,
        payload: { stepId: step.id, key: step.key, message, ...(payload ?? {}) },
      });
    },
    async hasConnection(provider) {
      const rows = await db
        .select({ id: authConnections.id })
        .from(authConnections)
        .where(and(eq(authConnections.orgId, step.orgId), eq(authConnections.provider, provider), eq(authConnections.status, "active")))
        .limit(1);
      return rows.length > 0;
    },
  };
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export const newWorkerId = () => `worker-${randomUUID().slice(0, 8)}`;
