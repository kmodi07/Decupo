import { and, asc, eq, gt, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { missionEvents, type MissionEvent } from "../db/schema";

export type EventInput = {
  orgId: string;
  missionId: string;
  type: string;
  actor: string; // "user:<id>" | "agent:<Name>" | "system"
  payload?: Record<string, unknown>;
};

/** Append an event with the next per-mission sequence number. */
export async function appendEvent(db: Db, e: EventInput): Promise<MissionEvent> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [row] = await db
        .insert(missionEvents)
        .values({
          orgId: e.orgId,
          missionId: e.missionId,
          type: e.type,
          actor: e.actor,
          payload: e.payload ?? {},
          seq: sql`(select coalesce(max(${missionEvents.seq}), 0) + 1 from ${missionEvents} where ${missionEvents.missionId} = ${e.missionId})`,
        })
        .returning();
      return row!;
    } catch (err) {
      const msg = String((err as Error).message ?? err);
      if (!/unique|duplicate/i.test(msg) || attempt === 4) throw err;
    }
  }
  throw new Error("unreachable");
}

export async function listEvents(db: Db, orgId: string, missionId: string, afterSeq = 0, limit = 500): Promise<MissionEvent[]> {
  return db
    .select()
    .from(missionEvents)
    .where(and(eq(missionEvents.orgId, orgId), eq(missionEvents.missionId, missionId), gt(missionEvents.seq, afterSeq)))
    .orderBy(asc(missionEvents.seq))
    .limit(limit);
}
