import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { creditLedger, organizations, type LedgerEntry } from "../db/schema";
import { ConflictError, InsufficientCreditsError, ValidationError } from "../errors";

/**
 * Append-only credit ledger.
 *
 *   balance   = sum(delta_balance)   credits the organisation owns
 *   reserved  = sum(delta_reserved)  credits held for authorised missions
 *   available = balance - reserved   credits that may still be reserved
 *
 * Every mutation runs in a transaction that locks the organisation row, so
 * concurrent reservations cannot both pass the availability check. Every
 * mutation carries an idempotency key; replaying a key returns the original
 * entry instead of applying the change twice.
 */

export type Balance = { balance: number; reserved: number; available: number };

type Tx = Db;

async function lockOrg(tx: Tx, orgId: string) {
  const rows = await tx.execute(sql`select id from ${organizations} where id = ${orgId} for update`);
  const found = Array.isArray(rows) ? rows.length : (rows as { rows?: unknown[] }).rows?.length;
  if (!found) throw new ValidationError("Unknown organisation");
}

async function sums(tx: Tx, orgId: string): Promise<Balance> {
  const [row] = await tx
    .select({
      balance: sql<number>`coalesce(sum(${creditLedger.deltaBalance}), 0)::int`,
      reserved: sql<number>`coalesce(sum(${creditLedger.deltaReserved}), 0)::int`,
    })
    .from(creditLedger)
    .where(eq(creditLedger.orgId, orgId));
  const balance = Number(row?.balance ?? 0);
  const reserved = Number(row?.reserved ?? 0);
  return { balance, reserved, available: balance - reserved };
}

async function findByKey(tx: Tx, orgId: string, key: string): Promise<LedgerEntry | undefined> {
  const [row] = await tx
    .select()
    .from(creditLedger)
    .where(and(eq(creditLedger.orgId, orgId), eq(creditLedger.idempotencyKey, key)))
    .limit(1);
  return row;
}

export async function getBalance(db: Db, orgId: string): Promise<Balance> {
  return sums(db, orgId);
}

export async function reservationRemaining(db: Db, reservationId: string): Promise<number> {
  const [row] = await db
    .select({ remaining: sql<number>`coalesce(sum(${creditLedger.deltaReserved}), 0)::int` })
    .from(creditLedger)
    .where(eq(creditLedger.reservationId, reservationId));
  return Number(row?.remaining ?? 0);
}

function assertPositiveInt(amount: number, what: string) {
  if (!Number.isInteger(amount) || amount <= 0) throw new ValidationError(`${what} must be a positive integer`);
}

export async function grant(
  db: Db,
  input: {
    orgId: string;
    amount: number;
    kind: "grant" | "purchase" | "adjustment";
    idempotencyKey: string;
    description?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<LedgerEntry> {
  if (input.kind === "adjustment") {
    if (!Number.isInteger(input.amount) || input.amount === 0) throw new ValidationError("Adjustment must be a non-zero integer");
  } else {
    assertPositiveInt(input.amount, "Grant amount");
  }
  return db.transaction(async (tx) => {
    await lockOrg(tx, input.orgId);
    const existing = await findByKey(tx, input.orgId, input.idempotencyKey);
    if (existing) return existing;
    if (input.kind === "adjustment" && input.amount < 0) {
      const b = await sums(tx, input.orgId);
      if (b.available + input.amount < 0) throw new InsufficientCreditsError(-input.amount, b.available);
    }
    const [row] = await tx
      .insert(creditLedger)
      .values({
        orgId: input.orgId,
        kind: input.kind,
        deltaBalance: input.amount,
        deltaReserved: 0,
        idempotencyKey: input.idempotencyKey,
        description: input.description ?? "",
        metadata: input.metadata ?? {},
      })
      .returning();
    return row!;
  });
}

/** Hold `amount` credits for a mission. Fails when available < amount. */
export async function reserve(
  db: Db,
  input: { orgId: string; missionId: string; amount: number; idempotencyKey: string; description?: string },
): Promise<{ reservationId: string; amount: number; entry: LedgerEntry }> {
  assertPositiveInt(input.amount, "Reservation amount");
  return db.transaction(async (tx) => {
    await lockOrg(tx, input.orgId);
    const existing = await findByKey(tx, input.orgId, input.idempotencyKey);
    if (existing) return { reservationId: existing.reservationId!, amount: existing.deltaReserved, entry: existing };
    const b = await sums(tx, input.orgId);
    if (b.available < input.amount) throw new InsufficientCreditsError(input.amount, b.available);
    const [row] = await tx
      .insert(creditLedger)
      .values({
        orgId: input.orgId,
        missionId: input.missionId,
        kind: "reserve",
        deltaBalance: 0,
        deltaReserved: input.amount,
        idempotencyKey: input.idempotencyKey,
        description: input.description ?? "Reserved for mission",
      })
      .returning();
    // The reservation is identified by its own ledger row id.
    const [updated] = await tx
      .update(creditLedger)
      .set({ reservationId: row!.id })
      .where(eq(creditLedger.id, row!.id))
      .returning();
    return { reservationId: updated!.id, amount: input.amount, entry: updated! };
  });
}

/**
 * Consume `amount` credits from a reservation. The amount is capped at what
 * remains reserved; the caller receives the settled amount and any overage so
 * it can surface a budget warning instead of silently overdrawing.
 */
export async function settle(
  db: Db,
  input: {
    orgId: string;
    missionId: string;
    reservationId: string;
    amount: number;
    idempotencyKey: string;
    description?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<{ settled: number; overage: number; entry: LedgerEntry | null }> {
  if (!Number.isInteger(input.amount) || input.amount < 0) throw new ValidationError("Settle amount must be >= 0");
  return db.transaction(async (tx) => {
    await lockOrg(tx, input.orgId);
    const existing = await findByKey(tx, input.orgId, input.idempotencyKey);
    if (existing) {
      const meta = existing.metadata as { overage?: number };
      return { settled: -existing.deltaBalance, overage: meta.overage ?? 0, entry: existing };
    }
    const remaining = await reservationRemaining(tx, input.reservationId);
    if (remaining <= 0 && input.amount > 0) throw new ConflictError("Reservation has no remaining credits");
    const settled = Math.min(input.amount, remaining);
    const overage = input.amount - settled;
    if (settled === 0) return { settled: 0, overage, entry: null };
    const [row] = await tx
      .insert(creditLedger)
      .values({
        orgId: input.orgId,
        missionId: input.missionId,
        reservationId: input.reservationId,
        kind: "settle",
        deltaBalance: -settled,
        deltaReserved: -settled,
        idempotencyKey: input.idempotencyKey,
        description: input.description ?? "Settled usage",
        metadata: { ...(input.metadata ?? {}), overage },
      })
      .returning();
    return { settled, overage, entry: row! };
  });
}

/** Release whatever remains of a reservation (refund of unrun work). */
export async function release(
  db: Db,
  input: { orgId: string; missionId: string; reservationId: string; idempotencyKey: string; description?: string },
): Promise<{ released: number; entry: LedgerEntry | null }> {
  return db.transaction(async (tx) => {
    await lockOrg(tx, input.orgId);
    const existing = await findByKey(tx, input.orgId, input.idempotencyKey);
    if (existing) return { released: -existing.deltaReserved, entry: existing };
    const remaining = await reservationRemaining(tx, input.reservationId);
    if (remaining <= 0) return { released: 0, entry: null };
    const [row] = await tx
      .insert(creditLedger)
      .values({
        orgId: input.orgId,
        missionId: input.missionId,
        reservationId: input.reservationId,
        kind: "release",
        deltaBalance: 0,
        deltaReserved: -remaining,
        idempotencyKey: input.idempotencyKey,
        description: input.description ?? "Released unused reservation",
      })
      .returning();
    return { released: remaining, entry: row! };
  });
}

export async function listLedger(db: Db, orgId: string, limit = 100): Promise<LedgerEntry[]> {
  return db
    .select()
    .from(creditLedger)
    .where(eq(creditLedger.orgId, orgId))
    .orderBy(desc(creditLedger.createdAt), desc(creditLedger.id))
    .limit(limit);
}
