import { createDb, setDbHandleForTests, type DbHandle } from "@/server/db/client";
import { signUp } from "@/server/auth/service";
import { resolveTenantContext } from "@/server/tenancy/context";

/** Boot an isolated in-memory PGlite database with migrations applied. */
export async function makeTestDb(): Promise<DbHandle> {
  const handle = await createDb({ driver: "pglite", pgliteDataDir: null, migrate: true });
  setDbHandleForTests(handle);
  return handle;
}

export async function closeTestDb(handle: DbHandle) {
  setDbHandleForTests(undefined);
  await handle.close();
}

let counter = 0;

/** Create a user + org via the real sign-up path and return a tenant context. */
export async function makeTenant(handle: DbHandle, opts: { name?: string; credits?: number } = {}) {
  counter += 1;
  const name = opts.name ?? `User ${counter}`;
  const prev = process.env.SIGNUP_GRANT_CREDITS;
  if (opts.credits !== undefined) process.env.SIGNUP_GRANT_CREDITS = String(opts.credits);
  try {
    const res = await signUp(handle.db, {
      email: `user${counter}-${Date.now()}@example.test`,
      name,
      password: "correct horse battery staple",
      orgName: `${name} Org`,
    });
    const ctx = await resolveTenantContext(handle.db, res.user.id);
    return { ...res, ctx };
  } finally {
    if (prev === undefined) delete process.env.SIGNUP_GRANT_CREDITS;
    else process.env.SIGNUP_GRANT_CREDITS = prev;
  }
}
