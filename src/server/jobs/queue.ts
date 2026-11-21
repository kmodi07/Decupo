import { and, asc, eq, lte, or, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { jobs, type Job } from "../db/schema";

export const RUN_STEP = "run_step";

export type EnqueueInput = {
  orgId: string;
  kind: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  runAt?: Date;
  maxAttempts?: number;
};

/** Insert a job; a duplicate idempotency key returns the existing job. */
export async function enqueue(db: Db, input: EnqueueInput): Promise<Job> {
  const inserted = await db
    .insert(jobs)
    .values({
      orgId: input.orgId,
      kind: input.kind,
      payload: input.payload,
      idempotencyKey: input.idempotencyKey,
      runAt: input.runAt ?? new Date(),
      maxAttempts: input.maxAttempts ?? 3,
    })
    .onConflictDoNothing({ target: jobs.idempotencyKey })
    .returning();
  if (inserted[0]) return inserted[0];
  const [existing] = await db.select().from(jobs).where(eq(jobs.idempotencyKey, input.idempotencyKey)).limit(1);
  return existing!;
}

/**
 * Claim the next runnable job: queued and due, or running with an expired
 * lease (its worker died). Uses a row lock with SKIP LOCKED so several
 * workers can poll the same table.
 */
export async function claim(db: Db, workerId: string, leaseMs: number, now = new Date()): Promise<Job | null> {
  return db.transaction(async (tx) => {
    const [candidate] = await tx
      .select()
      .from(jobs)
      .where(
        or(
          and(eq(jobs.status, "queued"), lte(jobs.runAt, now)),
          and(eq(jobs.status, "running"), lte(jobs.leaseExpiresAt, now)),
        ),
      )
      .orderBy(asc(jobs.runAt), asc(jobs.createdAt))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!candidate) return null;
    const [claimed] = await tx
      .update(jobs)
      .set({
        status: "running",
        lockedBy: workerId,
        leaseExpiresAt: new Date(now.getTime() + leaseMs),
        attempts: sql`${jobs.attempts} + 1`,
        updatedAt: now,
      })
      .where(eq(jobs.id, candidate.id))
      .returning();
    return claimed ?? null;
  });
}

export async function heartbeat(db: Db, jobId: string, workerId: string, leaseMs: number): Promise<void> {
  await db
    .update(jobs)
    .set({ leaseExpiresAt: new Date(Date.now() + leaseMs), updatedAt: new Date() })
    .where(and(eq(jobs.id, jobId), eq(jobs.lockedBy, workerId)));
}

export async function complete(db: Db, jobId: string): Promise<void> {
  const now = new Date();
  await db.update(jobs).set({ status: "succeeded", finishedAt: now, updatedAt: now, lockedBy: null, leaseExpiresAt: null }).where(eq(jobs.id, jobId));
}

export function backoffMs(attempt: number): number {
  // 2s, 8s, 32s ... capped at 10 minutes.
  return Math.min(10 * 60_000, 2_000 * 4 ** Math.max(0, attempt - 1));
}

/** Record a failure; re-queue with backoff while attempts remain. */
export async function fail(db: Db, job: Job, error: string, now = new Date()): Promise<"requeued" | "failed"> {
  const exhausted = job.attempts >= job.maxAttempts;
  await db
    .update(jobs)
    .set(
      exhausted
        ? { status: "failed", lastError: error, finishedAt: now, updatedAt: now, lockedBy: null, leaseExpiresAt: null }
        : {
            status: "queued",
            lastError: error,
            runAt: new Date(now.getTime() + backoffMs(job.attempts)),
            updatedAt: now,
            lockedBy: null,
            leaseExpiresAt: null,
          },
    )
    .where(eq(jobs.id, job.id));
  return exhausted ? "failed" : "requeued";
}

export async function cancelQueued(db: Db, predicate: { orgId: string; stepIds: string[] }): Promise<number> {
  if (predicate.stepIds.length === 0) return 0;
  const rows = await db
    .update(jobs)
    .set({ status: "canceled", updatedAt: new Date(), finishedAt: new Date() })
    .where(
      and(
        eq(jobs.orgId, predicate.orgId),
        eq(jobs.status, "queued"),
        sql`${jobs.payload}->>'stepId' in (${sql.join(
          predicate.stepIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      ),
    )
    .returning({ id: jobs.id });
  return rows.length;
}

export async function countByStatus(db: Db): Promise<Record<string, number>> {
  const rows = await db.select({ status: jobs.status, n: sql<number>`count(*)::int` }).from(jobs).groupBy(jobs.status);
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
}
