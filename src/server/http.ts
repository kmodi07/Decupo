import { assertSameOrigin } from "./auth/csrf";
import { readCookie, SESSION_COOKIE, validateSession, type SessionUser } from "./auth/session";
import { getDb, type Db } from "./db/client";
import { isAppError, UnauthorizedError } from "./errors";
import { resolveTenantContext, type TenantContext } from "./tenancy/context";

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function errorResponse(err: unknown): Response {
  if (isAppError(err)) {
    return json({ error: { code: err.code, message: err.message, details: err.details ?? null } }, { status: err.status });
  }
  console.error("[api] unhandled error", err);
  return json({ error: { code: "internal_error", message: "Something went wrong" } }, { status: 500 });
}

export async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export type AuthedRequest = { db: Db; session: SessionUser; ctx: TenantContext };

/** Resolve session + tenant for a request; throws AppError on failure. */
export async function authenticate(req: Request): Promise<AuthedRequest> {
  assertSameOrigin(req);
  const db = await getDb();
  const token = readCookie(req.headers.get("cookie"), SESSION_COOKIE);
  const session = await validateSession(db, token);
  if (!session) throw new UnauthorizedError();
  const orgId = req.headers.get("x-org-id") ?? new URL(req.url).searchParams.get("org") ?? undefined;
  const ctx = await resolveTenantContext(db, session.user.id, orgId);
  return { db, session, ctx };
}

/** Wrap a handler with auth, tenant resolution and error mapping. */
export function withAuth<P>(handler: (req: Request, a: AuthedRequest, params: P) => Promise<Response>) {
  return async (req: Request, routeCtx?: { params: Promise<P> }): Promise<Response> => {
    try {
      const a = await authenticate(req);
      const params = routeCtx ? await routeCtx.params : (undefined as P);
      return await handler(req, a, params);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** Wrap an unauthenticated handler (sign-up, login, health). */
export function withPublic<P>(handler: (req: Request, db: Db, params: P) => Promise<Response>) {
  return async (req: Request, routeCtx?: { params: Promise<P> }): Promise<Response> => {
    try {
      assertSameOrigin(req);
      const db = await getDb();
      const params = routeCtx ? await routeCtx.params : (undefined as P);
      return await handler(req, db, params);
    } catch (err) {
      return errorResponse(err);
    }
  };
}
