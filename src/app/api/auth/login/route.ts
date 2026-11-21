import { signIn } from "@/server/auth/service";
import { sessionCookie } from "@/server/auth/session";
import { json, readJson, withPublic } from "@/server/http";

export const POST = withPublic(async (req, db) => {
  const body = await readJson(req);
  const res = await signIn(db, body, req.headers.get("user-agent"));
  return json(
    { user: { id: res.user.id, email: res.user.email, name: res.user.name } },
    { headers: { "set-cookie": sessionCookie(res.token, res.expiresAt) } },
  );
});
