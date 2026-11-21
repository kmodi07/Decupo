import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import type { Db } from "../db/client";
import { sessions, users, type User } from "../db/schema";

export const SESSION_COOKIE = "decupo_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, sliding
const TOUCH_INTERVAL_MS = 60 * 60 * 1000; // refresh last_used_at at most hourly

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(db: Db, userId: string, userAgent?: string | null) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const [row] = await db
    .insert(sessions)
    .values({ userId, tokenHash: hashToken(token), expiresAt, userAgent: userAgent ?? null })
    .returning();
  return { token, session: row!, expiresAt };
}

export type SessionUser = { user: User; sessionId: string; expiresAt: Date };

export async function validateSession(db: Db, token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null;
  const now = new Date();
  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, now)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  let expiresAt = row.session.expiresAt;
  if (now.getTime() - row.session.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
    expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    await db.update(sessions).set({ lastUsedAt: now, expiresAt }).where(eq(sessions.id, row.session.id));
  }
  return { user: row.user, sessionId: row.session.id, expiresAt };
}

export async function revokeSession(db: Db, token: string | undefined | null): Promise<void> {
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

export async function revokeAllSessions(db: Db, userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/** Serialise the session cookie. `maxAge` 0 clears it. */
export function sessionCookie(token: string, expiresAt: Date | null): string {
  const secure = process.env.NODE_ENV === "production" || (process.env.APP_ORIGIN ?? "").startsWith("https://");
  const attrs = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    expiresAt ? `Expires=${expiresAt.toUTCString()}` : "Max-Age=0",
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

export function readCookie(cookieHeader: string | null | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}
