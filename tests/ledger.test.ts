import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "@/server/db/client";
import { closeTestDb, makeTenant, makeTestDb } from "./helpers/db";
import { getBalance, grant, listLedger, release, reservationRemaining, reserve, settle } from "@/server/ledger/service";
import { missions } from "@/server/db/schema";

let h: DbHandle;
beforeAll(async () => {
  h = await makeTestDb();
});
afterAll(async () => closeTestDb(h));

async function tenantWithMission(credits: number) {
  const t = await makeTenant(h, { credits });
  const [m] = await h.db
    .insert(missions)
    .values({ orgId: t.org.id, workspaceId: t.workspace.id, createdBy: t.user.id, title: "m", goal: "g" })
    .returning();
  return { ...t, mission: m! };
}

describe("credit ledger", () => {
  it("grants, reserves, settles and releases with correct balances", async () => {
    const t = await tenantWithMission(100);
    expect(await getBalance(h.db, t.org.id)).toEqual({ balance: 100, reserved: 0, available: 100 });

    const r = await reserve(h.db, { orgId: t.org.id, missionId: t.mission.id, amount: 60, idempotencyKey: "res-1" });
    expect(await getBalance(h.db, t.org.id)).toEqual({ balance: 100, reserved: 60, available: 40 });

    const s = await settle(h.db, {
      orgId: t.org.id,
      missionId: t.mission.id,
      reservationId: r.reservationId,
      amount: 25,
      idempotencyKey: "settle-1",
    });
    expect(s).toMatchObject({ settled: 25, overage: 0 });
    expect(await getBalance(h.db, t.org.id)).toEqual({ balance: 75, reserved: 35, available: 40 });
    expect(await reservationRemaining(h.db, r.reservationId)).toBe(35);

    const rel = await release(h.db, { orgId: t.org.id, missionId: t.mission.id, reservationId: r.reservationId, idempotencyKey: "rel-1" });
    expect(rel.released).toBe(35);
    expect(await getBalance(h.db, t.org.id)).toEqual({ balance: 75, reserved: 0, available: 75 });
  });

  it("never lets available go negative", async () => {
    const t = await tenantWithMission(50);
    await expect(reserve(h.db, { orgId: t.org.id, missionId: t.mission.id, amount: 51, idempotencyKey: "too-much" })).rejects.toMatchObject({
      code: "insufficient_credits",
    });
    await reserve(h.db, { orgId: t.org.id, missionId: t.mission.id, amount: 50, idempotencyKey: "all" });
    await expect(reserve(h.db, { orgId: t.org.id, missionId: t.mission.id, amount: 1, idempotencyKey: "one-more" })).rejects.toMatchObject({
      code: "insufficient_credits",
    });
    await expect(grant(h.db, { orgId: t.org.id, amount: -1, kind: "adjustment", idempotencyKey: "neg" })).rejects.toMatchObject({
      code: "insufficient_credits",
    });
  });

  it("caps settlement at the reservation and reports overage", async () => {
    const t = await tenantWithMission(100);
    const r = await reserve(h.db, { orgId: t.org.id, missionId: t.mission.id, amount: 10, idempotencyKey: "r" });
    const s = await settle(h.db, { orgId: t.org.id, missionId: t.mission.id, reservationId: r.reservationId, amount: 14, idempotencyKey: "s" });
    expect(s).toMatchObject({ settled: 10, overage: 4 });
    expect(await getBalance(h.db, t.org.id)).toEqual({ balance: 90, reserved: 0, available: 90 });
  });

  it("is idempotent per key", async () => {
    const t = await tenantWithMission(100);
    const a = await reserve(h.db, { orgId: t.org.id, missionId: t.mission.id, amount: 30, idempotencyKey: "same" });
    const b = await reserve(h.db, { orgId: t.org.id, missionId: t.mission.id, amount: 30, idempotencyKey: "same" });
    expect(b.reservationId).toBe(a.reservationId);
    expect(await getBalance(h.db, t.org.id)).toMatchObject({ reserved: 30 });
    await settle(h.db, { orgId: t.org.id, missionId: t.mission.id, reservationId: a.reservationId, amount: 5, idempotencyKey: "st" });
    await settle(h.db, { orgId: t.org.id, missionId: t.mission.id, reservationId: a.reservationId, amount: 5, idempotencyKey: "st" });
    expect(await getBalance(h.db, t.org.id)).toEqual({ balance: 95, reserved: 25, available: 70 });
    await release(h.db, { orgId: t.org.id, missionId: t.mission.id, reservationId: a.reservationId, idempotencyKey: "rl" });
    await release(h.db, { orgId: t.org.id, missionId: t.mission.id, reservationId: a.reservationId, idempotencyKey: "rl" });
    expect(await getBalance(h.db, t.org.id)).toEqual({ balance: 95, reserved: 0, available: 95 });
    const entries = await listLedger(h.db, t.org.id);
    expect(entries.map((e) => e.kind).sort()).toEqual(["grant", "release", "reserve", "settle"]);
  });

  it("keeps organisations' ledgers separate", async () => {
    const a = await tenantWithMission(100);
    const b = await tenantWithMission(5);
    await reserve(h.db, { orgId: a.org.id, missionId: a.mission.id, amount: 90, idempotencyKey: "a" });
    expect(await getBalance(h.db, b.org.id)).toEqual({ balance: 5, reserved: 0, available: 5 });
    expect((await listLedger(h.db, b.org.id)).every((e) => e.orgId === b.org.id)).toBe(true);
  });
});
