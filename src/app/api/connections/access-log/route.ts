import { json, withAuth } from "@/server/http";
import { listAccessLog } from "@/server/connections/service";

/** Every connect, revoke and external call made through this workspace's connections. */
export const GET = withAuth(async (req, { db, ctx }) => {
  const q = new URL(req.url).searchParams;
  const connectionId = q.get("connectionId") ?? undefined;
  const limit = Number(q.get("limit") ?? 200) || 200;
  return json({ entries: await listAccessLog(db, ctx, { connectionId, limit }) });
});
