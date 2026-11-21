import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { DbHandle } from "@/server/db/client";
import { closeTestDb, makeTenant, makeTestDb } from "./helpers/db";
import {
  authorizeMission,
  cancelMission,
  createMission,
  decideApproval,
  getMission,
  listApprovals,
  listArtifacts,
  listMissions,
  listSteps,
  pauseMission,
  resumeMission,
} from "@/server/missions/service";
import { listEvents } from "@/server/missions/events";
import { drain, runOnce } from "@/server/worker/runner";
import { getBalance } from "@/server/ledger/service";
import { jobs, memberships, missionSteps, toolInvocations } from "@/server/db/schema";
import { registerSkillForTests } from "@/server/skills/registry";
import type { Skill } from "@/server/skills/types";
import { z } from "zod";
import { claim } from "@/server/jobs/queue";

let h: DbHandle;
beforeAll(async () => {
  h = await makeTestDb();
});
afterAll(async () => closeTestDb(h));

describe("mission lifecycle", () => {
  it("plans a presentation mission, authorises, runs every step and settles credits", async () => {
    const t = await makeTenant(h, { credits: 500 });
    const { mission, plan } = await createMission(h.db, t.ctx, { goal: "Create a cited economics presentation on inflation" });
    expect(plan.templateId).toBe("presentation");
    expect(mission.status).toBe("awaiting_authorization");
    expect(mission.estimateCredits).toBe(70 + 70 + 20);
    expect(plan.team).toContain("Scout");

    const authorised = await authorizeMission(h.db, t.ctx, mission.id);
    expect(authorised.status).toBe("queued");
    expect(await getBalance(h.db, t.org.id)).toEqual({ balance: 500, reserved: 160, available: 340 });

    const processed = await drain(h.db);
    expect(processed).toBeGreaterThanOrEqual(3);

    const done = await getMission(h.db, t.ctx, mission.id);
    expect(done.status).toBe("completed");
    expect(done.summary).toBe("3/3 steps done");
    const steps = await listSteps(h.db, t.ctx, mission.id);
    expect(steps.map((s) => s.status)).toEqual(["succeeded", "succeeded", "succeeded"]);
    expect(steps.every((s) => s.actualCredits >= 20)).toBe(true);

    // Credits: everything settled against the reservation, remainder released, nothing negative.
    const bal = await getBalance(h.db, t.org.id);
    expect(bal.reserved).toBe(0);
    expect(bal.balance).toBe(500 - done.settledCredits);
    expect(done.settledCredits).toBeGreaterThan(0);
    expect(done.settledCredits).toBeLessThanOrEqual(160);

    const arts = await listArtifacts(h.db, t.ctx, mission.id);
    expect(arts.map((a) => a.title)).toEqual(["Research memo", "Deck outline", "Quality review"]);
    // Offline content is labelled, never passed off as researched.
    expect(arts[0]!.contentText).toContain("No sources retrieved");
    expect(arts[2]!.contentText).toContain("needs_work");

    const events = await listEvents(h.db, t.org.id, mission.id);
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("mission.created");
    expect(types).toContain("mission.authorized");
    expect(types).toContain("mission.started");
    expect(types).toContain("artifact.created");
    expect(types.at(-1)).toMatch(/mission\.completed|credits\.released/);
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
  });

  it("website mission stops at the Tier 3 deploy step until approved, then reports blocked (no hosting connection)", async () => {
    const t = await makeTenant(h, { credits: 1000 });
    const { mission, plan } = await createMission(h.db, t.ctx, { goal: "Build me a beautiful website for my tutoring company" });
    expect(plan.templateId).toBe("website");
    expect(plan.steps.find((s) => s.key === "deploy-preview")?.requiresApproval).toBe(true);
    await authorizeMission(h.db, t.ctx, mission.id);
    await drain(h.db);

    let m = await getMission(h.db, t.ctx, mission.id);
    expect(m.status).toBe("awaiting_review");
    const pending = await listApprovals(h.db, t.ctx, { missionId: mission.id, status: "pending" });
    expect(pending).toHaveLength(1);
    expect(pending[0]!.actionClass).toBe("deploy");
    // Nothing ran the deploy skill without approval.
    const deployStep = (await listSteps(h.db, t.ctx, mission.id)).find((s) => s.key === "deploy-preview")!;
    expect(deployStep.status).toBe("awaiting_approval");
    expect(deployStep.attempts).toBe(0);

    await decideApproval(h.db, t.ctx, pending[0]!.id, { decision: "approved" });
    await drain(h.db);
    m = await getMission(h.db, t.ctx, mission.id);
    expect(m.status).toBe("partially_completed");
    expect(m.summary).toBe("3/4 steps done, 1 blocked");
    const after = (await listSteps(h.db, t.ctx, mission.id)).find((s) => s.key === "deploy-preview")!;
    expect(after.status).toBe("blocked");
    expect(after.error).toMatch(/No hosting connection/);
    expect((await getBalance(h.db, t.org.id)).reserved).toBe(0);
  });

  it("rejecting an approval skips the step and finishes the mission honestly", async () => {
    const t = await makeTenant(h, { credits: 1000 });
    const { mission } = await createMission(h.db, t.ctx, { goal: "Launch a landing page for my newsletter" });
    await authorizeMission(h.db, t.ctx, mission.id);
    await drain(h.db);
    const [appr] = await listApprovals(h.db, t.ctx, { missionId: mission.id, status: "pending" });
    await decideApproval(h.db, t.ctx, appr!.id, { decision: "rejected", note: "Not yet" });
    const m = await getMission(h.db, t.ctx, mission.id);
    expect(m.status).toBe("partially_completed");
    expect(m.summary).toBe("3/4 steps done, 1 skipped");
  });

  it("pause stops new steps, resume continues, cancel releases the reservation", async () => {
    const t = await makeTenant(h, { credits: 1000 });
    const { mission } = await createMission(h.db, t.ctx, { goal: "Make a pitch deck for investors" });
    await authorizeMission(h.db, t.ctx, mission.id);
    expect(await runOnce(h.db)).toBe(true); // research-memo runs
    const paused = await pauseMission(h.db, t.ctx, mission.id, "taking a break");
    expect(paused.status).toBe("paused");
    expect(await drain(h.db)).toBe(0); // queued jobs were canceled
    let steps = await listSteps(h.db, t.ctx, mission.id);
    expect(steps.map((s) => s.status)).toEqual(["succeeded", "ready", "pending"]);

    const resumed = await resumeMission(h.db, t.ctx, mission.id);
    expect(resumed.status).toBe("queued");
    expect(await runOnce(h.db)).toBe(true); // deck-outline
    steps = await listSteps(h.db, t.ctx, mission.id);
    expect(steps[1]!.status).toBe("succeeded");

    const before = await getBalance(h.db, t.org.id);
    expect(before.reserved).toBeGreaterThan(0);
    const canceled = await cancelMission(h.db, t.ctx, mission.id, "changed my mind");
    expect(canceled.status).toBe("canceled");
    const afterBal = await getBalance(h.db, t.org.id);
    expect(afterBal.reserved).toBe(0);
    expect(afterBal.balance).toBe(1000 - (await getMission(h.db, t.ctx, mission.id)).settledCredits);
    steps = await listSteps(h.db, t.ctx, mission.id);
    expect(steps[2]!.status).toBe("canceled");
    expect(await drain(h.db)).toBe(0);
    await expect(resumeMission(h.db, t.ctx, mission.id)).rejects.toMatchObject({ code: "invalid_transition" });
  });

  it("refuses authorisation when credits are insufficient and leaves the mission untouched", async () => {
    const t = await makeTenant(h, { credits: 10 });
    const { mission } = await createMission(h.db, t.ctx, { goal: "Research the market for pet subscription boxes" });
    await expect(authorizeMission(h.db, t.ctx, mission.id)).rejects.toMatchObject({ code: "insufficient_credits" });
    expect((await getMission(h.db, t.ctx, mission.id)).status).toBe("awaiting_authorization");
    expect(await getBalance(h.db, t.org.id)).toEqual({ balance: 10, reserved: 0, available: 10 });
  });
});

describe("durable execution", () => {
  const flaky: { calls: number; sideEffects: number } = { calls: 0, sideEffects: 0 };
  const flakySkill: Skill = {
    manifest: {
      id: "test-flaky",
      version: "0.0.1",
      name: "Flaky",
      description: "fails once, then succeeds; performs one side effect",
      agent: "Forge",
      actionClass: "generate",
      permissionScopes: ["artifact:write"],
      privacy: "internal",
      cost: { baseCredits: 5, variableAllowanceCredits: 0, creditsPerThousandTokens: 0 },
      timeoutMs: 5_000,
      maxAttempts: 3,
      availability: "supported",
      inputSchema: z.record(z.string(), z.unknown()),
    },
    async run(ctx) {
      flaky.calls += 1;
      const effect = await ctx.once("effect", "test.effect", async () => {
        flaky.sideEffects += 1;
        return { id: "ext-1" };
      });
      if (flaky.calls === 1) throw new Error("transient failure");
      return { status: "succeeded", output: { effect }, summary: "ok" };
    },
  };

  it("retries a failed step with backoff and replays side effects exactly once", async () => {
    registerSkillForTests(flakySkill);
    const t = await makeTenant(h, { credits: 100 });
    const { mission } = await createMission(h.db, t.ctx, { goal: "Research something generic for the flaky test" });
    // Swap the first step's skill for the flaky one.
    const steps = await listSteps(h.db, t.ctx, mission.id);
    await h.db.update(missionSteps).set({ skillId: "test-flaky", maxAttempts: 3 }).where(eq(missionSteps.id, steps[0]!.id));
    await authorizeMission(h.db, t.ctx, mission.id);

    expect(await runOnce(h.db)).toBe(true); // attempt 1 fails -> requeued with backoff
    let s = (await listSteps(h.db, t.ctx, mission.id))[0]!;
    expect(s.status).toBe("ready");
    expect(s.attempts).toBe(1);
    expect(s.error).toBe("transient failure");
    const [job] = await h.db.select().from(jobs).where(and(eq(jobs.orgId, t.org.id), eq(jobs.status, "queued")));
    expect(job!.runAt.getTime()).toBeGreaterThan(Date.now());
    expect(await runOnce(h.db)).toBe(false); // not due yet

    // Make it due and run again.
    await h.db.update(jobs).set({ runAt: new Date(Date.now() - 1000) }).where(eq(jobs.id, job!.id));
    await drain(h.db);
    s = (await listSteps(h.db, t.ctx, mission.id))[0]!;
    expect(s.status).toBe("succeeded");
    expect(s.attempts).toBe(2);
    expect(flaky.calls).toBe(2);
    expect(flaky.sideEffects).toBe(1); // replayed from the journal, not repeated
    expect(s.output).toEqual({ effect: { id: "ext-1" } });
    const inv = await h.db.select().from(toolInvocations).where(eq(toolInvocations.stepId, s.id));
    expect(inv).toHaveLength(1);
  });

  it("a job whose worker died (expired lease) is reclaimed by another worker", async () => {
    const t = await makeTenant(h, { credits: 100 });
    const { mission } = await createMission(h.db, t.ctx, { goal: "Research resilience of the queue for this test" });
    await authorizeMission(h.db, t.ctx, mission.id);
    // Worker A claims the job and crashes before doing anything (lease already expired).
    const dead = await claim(h.db, "worker-A", -1);
    expect(dead).not.toBeNull();
    // Worker B picks it up because the lease expired.
    expect(await runOnce(h.db, { workerId: "worker-B" })).toBe(true);
    const [job] = await h.db.select().from(jobs).where(eq(jobs.id, dead!.id));
    expect(job!.status).toBe("succeeded");
    expect(job!.attempts).toBe(2);
    await drain(h.db);
    expect((await getMission(h.db, t.ctx, mission.id)).status).toBe("completed");
  });

  it("blocks a step the budget ceiling cannot cover instead of overdrawing", async () => {
    const t = await makeTenant(h, { credits: 1000 });
    const { mission } = await createMission(h.db, t.ctx, { goal: "Make a presentation about budgets" });
    // Inflate the last step's estimate beyond the ceiling after reservation.
    await authorizeMission(h.db, t.ctx, mission.id);
    const steps = await listSteps(h.db, t.ctx, mission.id);
    await h.db.update(missionSteps).set({ estimatedCredits: 10_000 }).where(eq(missionSteps.id, steps[2]!.id));
    await drain(h.db);
    const m = await getMission(h.db, t.ctx, mission.id);
    expect(m.status).toBe("partially_completed");
    const last = (await listSteps(h.db, t.ctx, mission.id))[2]!;
    expect(last.status).toBe("blocked");
    expect(last.error).toMatch(/Budget ceiling/);
    const bal = await getBalance(h.db, t.org.id);
    expect(bal.reserved).toBe(0);
    expect(bal.balance).toBeGreaterThan(0);
  });
});

describe("tenant isolation and permissions", () => {
  it("another organisation cannot see, authorise or cancel a mission", async () => {
    const a = await makeTenant(h, { credits: 500 });
    const b = await makeTenant(h, { credits: 500 });
    const { mission } = await createMission(h.db, a.ctx, { goal: "Research something private to org A" });
    await expect(getMission(h.db, b.ctx, mission.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(authorizeMission(h.db, b.ctx, mission.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(cancelMission(h.db, b.ctx, mission.id)).rejects.toMatchObject({ code: "not_found" });
    expect((await listMissions(h.db, b.ctx)).map((m) => m.id)).not.toContain(mission.id);
    await expect(listArtifacts(h.db, b.ctx, mission.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("a viewer can read but cannot create, authorise or decide", async () => {
    const owner = await makeTenant(h, { credits: 500 });
    const viewer = await makeTenant(h);
    await h.db.insert(memberships).values({ orgId: owner.org.id, userId: viewer.user.id, role: "viewer" });
    const vctx = { orgId: owner.org.id, userId: viewer.user.id, role: "viewer" as const };
    const { mission } = await createMission(h.db, owner.ctx, { goal: "Research viewer permissions for this test" });
    expect((await getMission(h.db, vctx, mission.id)).id).toBe(mission.id);
    await expect(createMission(h.db, vctx, { goal: "Viewer trying to create a mission" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(authorizeMission(h.db, vctx, mission.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(pauseMission(h.db, vctx, mission.id)).rejects.toMatchObject({ code: "forbidden" });
  });
});
