import { authenticate, errorResponse } from "@/server/http";
import { completeOAuth } from "@/server/connections/service";
import { isAppError } from "@/server/errors";
import { appOrigin } from "@/server/auth/csrf";

/**
 * OAuth redirect target. The provider sends the browser here with `state` and
 * `code`; the signed-in user must be the one who started the flow. Always
 * redirects back to Connected apps with a result in the query string so the
 * provider never sees an API error body.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const back = new URL("/app/connections", appOrigin());
  try {
    const a = await authenticate(req);
    const connection = await completeOAuth(a.db, a.ctx, {
      state: url.searchParams.get("state"),
      code: url.searchParams.get("code"),
      error: url.searchParams.get("error"),
    });
    back.searchParams.set("connected", connection.provider);
  } catch (err) {
    if (!isAppError(err)) return errorResponse(err);
    if (err.status === 401) return Response.redirect(new URL("/login", appOrigin()).toString(), 302);
    back.searchParams.set("error", err.message);
  }
  return Response.redirect(back.toString(), 302);
}
