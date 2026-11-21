import { json, withAuth } from "@/server/http";
import { listApprovals } from "@/server/missions/service";

export const GET = withAuth(async (req, { db, ctx }) => {
  const status = new URL(req.url).searchParams.get("status");
  const allowed = ["pending", "approved", "rejected", "expired"] as const;
  const filter = allowed.find((s) => s === status);
  const approvals = await listApprovals(db, ctx, filter ? { status: filter } : {});
  return json({ approvals });
});
