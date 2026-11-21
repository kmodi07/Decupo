import { json, withAuth } from "@/server/http";
import { getBalance, listLedger } from "@/server/ledger/service";
import { requirePermission } from "@/server/tenancy/rbac";

export const GET = withAuth(async (_req, { db, ctx }) => {
  requirePermission(ctx, "ledger:read");
  const [balance, entries] = await Promise.all([getBalance(db, ctx.orgId), listLedger(db, ctx.orgId, 200)]);
  return json({ balance, entries });
});
