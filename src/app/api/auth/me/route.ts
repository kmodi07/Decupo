import { json, withAuth } from "@/server/http";
import { getBalance } from "@/server/ledger/service";
import { listUserOrganizations } from "@/server/tenancy/context";
import { permissionsFor } from "@/server/tenancy/rbac";
import { llmStatus } from "@/server/llm";

export const GET = withAuth(async (_req, { db, session, ctx }) => {
  const [orgs, balance] = await Promise.all([listUserOrganizations(db, session.user.id), getBalance(db, ctx.orgId)]);
  return json({
    user: { id: session.user.id, email: session.user.email, name: session.user.name },
    org: { id: ctx.orgId, role: ctx.role, permissions: permissionsFor(ctx.role) },
    organizations: orgs,
    credits: balance,
    providers: { llm: llmStatus() },
  });
});
