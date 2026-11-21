import { signUp } from "@/server/auth/service";
import { sessionCookie } from "@/server/auth/session";
import { json, readJson, withPublic } from "@/server/http";

export const POST = withPublic(async (req, db) => {
  const body = await readJson(req);
  const res = await signUp(db, body, req.headers.get("user-agent"));
  return json(
    { user: { id: res.user.id, email: res.user.email, name: res.user.name }, org: { id: res.org.id, name: res.org.name } },
    { status: 201, headers: { "set-cookie": sessionCookie(res.token, res.expiresAt) } },
  );
});
