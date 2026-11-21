import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client";
import { memberships, organizations, users, workspaces } from "../db/schema";
import { ConflictError, UnauthorizedError, ValidationError } from "../errors";
import { grant } from "../ledger/service";
import { hashPassword, PASSWORD_MIN_LENGTH, verifyPassword } from "./password";
import { createSession } from "./session";
import { randomBytes } from "node:crypto";

export const signUpSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(256),
  orgName: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v ? v : undefined)),
});

/** First zod issue as a human sentence, e.g. "password: Too small". */
export function firstIssue(issues: { path: PropertyKey[]; message: string }[], fallback: string): string {
  const i = issues[0];
  if (!i) return fallback;
  const path = i.path.map(String).join(".");
  return path ? `${fallback}: ${path} ${i.message.charAt(0).toLowerCase()}${i.message.slice(1)}` : `${fallback}: ${i.message}`;
}

export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(256),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "org"}-${randomBytes(3).toString("hex")}`;
}

export function signupGrantCredits(): number {
  const n = Number(process.env.SIGNUP_GRANT_CREDITS ?? 100);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

/**
 * Create a user, their first organisation (as owner), a default workspace,
 * grant the Explore-tier credits, and open a session.
 */
export async function signUp(db: Db, raw: unknown, userAgent?: string | null) {
  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(firstIssue(parsed.error.issues, "Invalid sign-up details"), { issues: parsed.error.issues });
  const input = parsed.data;

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
  if (existing.length) throw new ConflictError("An account with that email already exists");

  const passwordHash = await hashPassword(input.password);
  const orgName = input.orgName?.trim() || `${input.name}'s workspace`;

  const result = await db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({ email: input.email, name: input.name, passwordHash }).returning();
    const [org] = await tx.insert(organizations).values({ name: orgName, slug: slugify(orgName) }).returning();
    await tx.insert(memberships).values({ orgId: org!.id, userId: user!.id, role: "owner" });
    const [ws] = await tx.insert(workspaces).values({ orgId: org!.id, name: "General" }).returning();
    const credits = signupGrantCredits();
    if (credits > 0) {
      await grant(tx, {
        orgId: org!.id,
        amount: credits,
        kind: "grant",
        idempotencyKey: `signup-grant:${org!.id}`,
        description: "Explore tier welcome credits",
      });
    }
    return { user: user!, org: org!, workspace: ws! };
  });

  const { token, expiresAt } = await createSession(db, result.user.id, userAgent);
  return { ...result, token, expiresAt };
}

export async function signIn(db: Db, raw: unknown, userAgent?: string | null) {
  const parsed = signInSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError("Invalid sign-in details");
  const input = parsed.data;
  const [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
  // Always run the hash check so timing does not reveal whether the email exists.
  const ok = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw new UnauthorizedError("Email or password is incorrect");
  const { token, expiresAt } = await createSession(db, user.id, userAgent);
  return { user, token, expiresAt };
}

// A valid scrypt string for a random password; used to equalise timing.
const DUMMY_HASH = "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
