import type { MembershipRole } from "../db/schema";
import { ForbiddenError } from "../errors";

export type Permission =
  | "mission:create"
  | "mission:read"
  | "mission:authorize"
  | "mission:control" // pause / resume / cancel
  | "approval:decide"
  | "artifact:read"
  | "ledger:read"
  | "ledger:adjust"
  | "member:manage"
  | "connection:manage"
  | "org:manage";

const ALL: Permission[] = [
  "mission:create",
  "mission:read",
  "mission:authorize",
  "mission:control",
  "approval:decide",
  "artifact:read",
  "ledger:read",
  "ledger:adjust",
  "member:manage",
  "connection:manage",
  "org:manage",
];

const ROLE_PERMISSIONS: Record<MembershipRole, ReadonlySet<Permission>> = {
  owner: new Set(ALL),
  admin: new Set(ALL.filter((p) => p !== "org:manage")),
  member: new Set<Permission>([
    "mission:create",
    "mission:read",
    "mission:authorize",
    "mission:control",
    "approval:decide",
    "artifact:read",
    "ledger:read",
  ]),
  viewer: new Set<Permission>(["mission:read", "artifact:read", "ledger:read"]),
};

export type TenantContext = {
  orgId: string;
  userId: string;
  role: MembershipRole;
};

export function can(ctx: Pick<TenantContext, "role">, permission: Permission): boolean {
  return ROLE_PERMISSIONS[ctx.role].has(permission);
}

export function requirePermission(ctx: TenantContext, permission: Permission): void {
  if (!can(ctx, permission)) throw new ForbiddenError(`Your role (${ctx.role}) cannot ${permission}`);
}

export function permissionsFor(role: MembershipRole): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}
