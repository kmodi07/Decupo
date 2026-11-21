import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import type { DbHandle } from "@/server/db/client";
import { closeTestDb, makeTenant, makeTestDb } from "./helpers/db";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { signIn, signUp } from "@/server/auth/service";
import { createSession, readCookie, revokeSession, sessionCookie, validateSession } from "@/server/auth/session";
import { assertSameOrigin } from "@/server/auth/csrf";
import { can, requirePermission } from "@/server/tenancy/rbac";
import { resolveTenantContext } from "@/server/tenancy/context";
import { decryptSecret, encryptSecret } from "@/server/secrets/crypto";
import { missions } from "@/server/db/schema";

let h: DbHandle;
beforeAll(async () => {
  h = await makeTestDb();
});
afterAll(async () => closeTestDb(h));

describe("migrations", () => {
  it("creates the tenant tables", async () => {
    const res = await h.db.execute(sql`select table_name from information_schema.tables where table_schema = 'public' order by 1`);
    const rows = (Array.isArray(res) ? res : (res as { rows: { table_name: string }[] }).rows) as { table_name: string }[];
    const names = rows.map((r) => r.table_name);
    for (const t of ["organizations", "users", "memberships", "missions", "mission_steps", "credit_ledger", "jobs"]) {
      expect(names).toContain(t);
    }
  });
});

describe("passwords", () => {
  it("hashes and verifies with scrypt", async () => {
    const hash = await hashPassword("hunter2-hunter2");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("hunter2-hunter2", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
});

describe("sign-up and sign-in", () => {
  it("creates user, org, membership, workspace, welcome credits and a session", async () => {
    const t = await makeTenant(h, { credits: 100 });
    expect(t.ctx.role).toBe("owner");
    const sess = await validateSession(h.db, t.token);
    expect(sess?.user.id).toBe(t.user.id);
    await revokeSession(h.db, t.token);
    expect(await validateSession(h.db, t.token)).toBeNull();
  });

  it("rejects duplicate emails, short passwords and wrong credentials without leaking which", async () => {
    const t = await makeTenant(h);
    await expect(signUp(h.db, { email: t.user.email, name: "Dup", password: "long enough password" })).rejects.toMatchObject({
      code: "conflict",
    });
    await expect(signUp(h.db, { email: "x@example.test", name: "Short", password: "short" })).rejects.toMatchObject({
      code: "validation_error",
    });
    await expect(signIn(h.db, { email: t.user.email, password: "nope-nope-nope" })).rejects.toMatchObject({ code: "unauthorized" });
    await expect(signIn(h.db, { email: "nobody@example.test", password: "nope-nope-nope" })).rejects.toMatchObject({
      code: "unauthorized",
    });
    const ok = await signIn(h.db, { email: t.user.email.toUpperCase(), password: "correct horse battery staple" });
    expect(ok.user.id).toBe(t.user.id);
  });

  it("session tokens are stored hashed and cookies are HttpOnly", async () => {
    const t = await makeTenant(h);
    const { token } = await createSession(h.db, t.user.id);
    const raw = await h.db.execute(sql`select token_hash from sessions`);
    const rows = (Array.isArray(raw) ? raw : (raw as { rows: { token_hash: string }[] }).rows) as { token_hash: string }[];
    expect(rows.some((r) => r.token_hash === token)).toBe(false);
    const cookie = sessionCookie(token, new Date(Date.now() + 1000));
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(readCookie(cookie.split(";")[0], "decupo_session")).toBe(token);
  });
});

describe("csrf origin check", () => {
  const mk = (method: string, headers: Record<string, string>) => new Request("http://localhost:3000/api/x", { method, headers });
  it("allows GET, same-origin POST; rejects cross-origin and missing origin", () => {
    expect(() => assertSameOrigin(mk("GET", {}))).not.toThrow();
    expect(() => assertSameOrigin(mk("POST", { origin: "http://localhost:3000" }))).not.toThrow();
    expect(() => assertSameOrigin(mk("POST", { referer: "http://localhost:3000/app" }))).not.toThrow();
    expect(() => assertSameOrigin(mk("POST", { origin: "https://evil.example" }))).toThrow();
    expect(() => assertSameOrigin(mk("POST", { origin: "https://evil.example", host: "localhost:3000" }))).toThrow();
    expect(() => assertSameOrigin(mk("POST", { origin: "http://localhost:3001", host: "localhost:3001" }))).not.toThrow();
    expect(() => assertSameOrigin(mk("POST", { origin: "http://localhost:3001", host: "localhost:3000" }))).toThrow();
    expect(() => assertSameOrigin(mk("POST", {}))).toThrow();
  });
});

describe("rbac and tenancy", () => {
  it("maps roles to permissions", () => {
    expect(can({ role: "owner" }, "org:manage")).toBe(true);
    expect(can({ role: "admin" }, "org:manage")).toBe(false);
    expect(can({ role: "member" }, "mission:create")).toBe(true);
    expect(can({ role: "viewer" }, "mission:create")).toBe(false);
    expect(() => requirePermission({ orgId: "o", userId: "u", role: "viewer" }, "mission:authorize")).toThrow();
  });

  it("denies a user access to an organisation they do not belong to", async () => {
    const a = await makeTenant(h);
    const b = await makeTenant(h);
    await expect(resolveTenantContext(h.db, a.user.id, b.org.id)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("row-level security blocks cross-tenant reads for the app role", async () => {
    const a = await makeTenant(h);
    const b = await makeTenant(h);
    await h.db.insert(missions).values({
      orgId: a.org.id,
      workspaceId: a.workspace.id,
      createdBy: a.user.id,
      title: "A's mission",
      goal: "secret",
    });
    await h.db.insert(missions).values({
      orgId: b.org.id,
      workspaceId: b.workspace.id,
      createdBy: b.user.id,
      title: "B's mission",
      goal: "secret",
    });
    // Switch to the non-owner application role inside one transaction and set the tenant.
    const seenByB = await h.db.transaction(async (tx) => {
      await tx.execute(sql`set local role decupo_app`);
      await tx.execute(sql`select set_config('app.current_org_id', ${b.org.id}, true)`);
      const res = await tx.execute(sql`select org_id from missions`);
      return (Array.isArray(res) ? res : (res as { rows: { org_id: string }[] }).rows) as { org_id: string }[];
    });
    expect(seenByB.length).toBeGreaterThan(0);
    expect(seenByB.every((r) => r.org_id === b.org.id)).toBe(true);
  });
});

describe("secrets", () => {
  it("round-trips with AES-256-GCM and rejects tampering", () => {
    const env = encryptSecret("refresh-token-123", "conn:1");
    expect(env.startsWith("v1:")).toBe(true);
    expect(decryptSecret(env, "conn:1")).toBe("refresh-token-123");
    expect(() => decryptSecret(env, "conn:2")).toThrow();
    const tampered = env.slice(0, -2) + (env.endsWith("A") ? "BB" : "AA");
    expect(() => decryptSecret(tampered, "conn:1")).toThrow();
  });
});
