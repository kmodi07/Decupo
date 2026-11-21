import { and, asc, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { memberships, organizations, workspaces } from "../db/schema";
import { ForbiddenError, NotFoundError } from "../errors";
import type { TenantContext } from "./rbac";

export type { TenantContext } from "./rbac";

/**
 * Resolve the tenant context for a user. When `orgId` is omitted the user's
 * earliest membership is used (their personal organisation after sign-up).
 * A user with no membership in `orgId` gets a 403, never a hint that the
 * organisation exists.
 */
export async function resolveTenantContext(db: Db, userId: string, orgId?: string | null): Promise<TenantContext> {
  const rows = await db
    .select({ orgId: memberships.orgId, role: memberships.role })
    .from(memberships)
    .where(orgId ? and(eq(memberships.userId, userId), eq(memberships.orgId, orgId)) : eq(memberships.userId, userId))
    .orderBy(asc(memberships.createdAt))
    .limit(1);
  const m = rows[0];
  if (!m) throw new ForbiddenError("No access to this organisation");
  return { orgId: m.orgId, userId, role: m.role };
}

export async function listUserOrganizations(db: Db, userId: string) {
  return db
    .select({ id: organizations.id, name: organizations.name, slug: organizations.slug, role: memberships.role })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(eq(memberships.userId, userId))
    .orderBy(asc(memberships.createdAt));
}

export async function defaultWorkspaceId(db: Db, ctx: TenantContext): Promise<string> {
  const [ws] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.orgId, ctx.orgId))
    .orderBy(asc(workspaces.createdAt))
    .limit(1);
  if (!ws) throw new NotFoundError("Workspace");
  return ws.id;
}
