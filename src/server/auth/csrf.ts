import { ForbiddenError } from "../errors";

export function appOrigin(): string {
  return (process.env.APP_ORIGIN ?? "http://localhost:3000").replace(/\/$/, "");
}

/**
 * Mutating API requests must come from our own origin. Browsers always send
 * `Origin` on cross-site POSTs; same-origin fetches send it too. A missing
 * `Origin` falls back to `Referer`. Requests with neither are rejected.
 */
export function assertSameOrigin(req: Request): void {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;
  const allowed = (candidate: string): boolean => {
    const c = candidate.replace(/\/$/, "");
    if (c === appOrigin()) return true;
    // Origin/Host comparison: the browser sets both, so a cross-site page can
    // never make them agree. Lets the app run on any port in development.
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    try {
      return !!host && new URL(c).host === host;
    } catch {
      return false;
    }
  };
  const origin = req.headers.get("origin");
  if (origin) {
    if (!allowed(origin)) throw new ForbiddenError("Cross-origin request rejected");
    return;
  }
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      if (!allowed(new URL(referer).origin)) throw new ForbiddenError("Cross-origin request rejected");
      return;
    } catch {
      throw new ForbiddenError("Cross-origin request rejected");
    }
  }
  throw new ForbiddenError("Missing Origin header");
}
