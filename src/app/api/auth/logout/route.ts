import { readCookie, revokeSession, SESSION_COOKIE, sessionCookie } from "@/server/auth/session";
import { json, withPublic } from "@/server/http";

export const POST = withPublic(async (req, db) => {
  await revokeSession(db, readCookie(req.headers.get("cookie"), SESSION_COOKIE));
  return json({ ok: true }, { headers: { "set-cookie": sessionCookie("", null) } });
});
