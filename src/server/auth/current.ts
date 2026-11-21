import { cookies } from "next/headers";
import { getDb } from "../db/client";
import { SESSION_COOKIE, validateSession, type SessionUser } from "./session";

/** Server-component helper: the current session or null. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  return validateSession(db, token);
}
