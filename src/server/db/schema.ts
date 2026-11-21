import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums (vocabulary follows PRODUCT_BLUEPRINT.md section 3)
// ---------------------------------------------------------------------------
export const membershipRole = pgEnum("membership_role", ["owner", "admin", "member", "viewer"]);

export const missionStatus = pgEnum("mission_status", [
  "draft",
  "estimated",
  "awaiting_authorization",
  "queued",
  "running",
  "awaiting_review",
  "completed",
  "partially_completed",
  "failed",
  "paused",
  "canceled",
]);

export const stepStatus = pgEnum("step_status", [
  "pending", // waiting on dependencies
  "ready", // dependencies met, job enqueued
  "running",
  "awaiting_approval",
  "succeeded",
  "failed",
  "blocked", // cannot proceed: missing connection, budget, or approval denied
  "skipped",
  "canceled",
]);

export const approvalStatus = pgEnum("approval_status", ["pending", "approved", "rejected", "expired"]);

export const ledgerKind = pgEnum("ledger_kind", [
  "grant", // free / plan credits added
  "purchase", // paid credits added
  "reserve", // hold against a mission (delta_reserved +)
  "settle", // consume from a reservation (delta_balance -, delta_reserved -)
  "release", // give back unused reservation (delta_reserved -)
  "adjustment", // operator correction, either sign
]);

export const jobStatus = pgEnum("job_status", ["queued", "running", "succeeded", "failed", "canceled"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

// ---------------------------------------------------------------------------
// Identity and tenancy
// ---------------------------------------------------------------------------
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: text("plan").notNull().default("explore"),
  ...timestamps,
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(), // normalised lower-case
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: membershipRole("role").notNull().default("member"),
    ...timestamps,
  },
  (t) => [uniqueIndex("memberships_org_user_idx").on(t.orgId, t.userId), index("memberships_user_idx").on(t.userId)],
);

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    ...timestamps,
  },
  (t) => [index("workspaces_org_idx").on(t.orgId)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sessions_token_hash_idx").on(t.tokenHash), index("sessions_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Missions
// ---------------------------------------------------------------------------
export const missions = pgTable(
  "missions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    goal: text("goal").notNull(),
    status: missionStatus("status").notNull().default("draft"),
    /** Planner output (template id, agents, questions). Opaque to the engine. */
    plan: jsonb("plan").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    estimateCredits: integer("estimate_credits").notNull().default(0),
    budgetCeilingCredits: integer("budget_ceiling_credits").notNull().default(0),
    settledCredits: integer("settled_credits").notNull().default(0),
    reservationId: uuid("reservation_id"),
    summary: text("summary"),
    pausedReason: text("paused_reason"),
    authorizedAt: timestamp("authorized_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("missions_org_idx").on(t.orgId, t.createdAt), index("missions_status_idx").on(t.status)],
);

export const missionSteps = pgTable(
  "mission_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    missionId: uuid("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    title: text("title").notNull(),
    agent: text("agent").notNull(),
    skillId: text("skill_id").notNull(),
    skillVersion: text("skill_version").notNull(),
    status: stepStatus("status").notNull().default("pending"),
    dependsOn: jsonb("depends_on").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    position: integer("position").notNull().default(0),
    input: jsonb("input").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    output: jsonb("output").$type<Record<string, unknown> | null>(),
    error: text("error"),
    estimatedCredits: integer("estimated_credits").notNull().default(0),
    actualCredits: integer("actual_credits").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    requiresApproval: boolean("requires_approval").notNull().default(false),
    actionClass: text("action_class"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("mission_steps_mission_key_idx").on(t.missionId, t.key), index("mission_steps_status_idx").on(t.status)],
);

export const missionEvents = pgTable(
  "mission_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    missionId: uuid("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    type: text("type").notNull(),
    actor: text("actor").notNull(), // "user:<id>" | "agent:<name>" | "system"
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("mission_events_mission_seq_idx").on(t.missionId, t.seq)],
);

export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    missionId: uuid("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),
    stepId: uuid("step_id").references(() => missionSteps.id, { onDelete: "cascade" }),
    actionClass: text("action_class").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: approvalStatus("status").notNull().default("pending"),
    decidedBy: uuid("decided_by").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("approvals_org_status_idx").on(t.orgId, t.status)],
);

export const artifacts = pgTable(
  "artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    missionId: uuid("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),
    stepId: uuid("step_id").references(() => missionSteps.id, { onDelete: "set null" }),
    kind: text("kind").notNull(), // markdown | json | html | css | file
    title: text("title").notNull(),
    /** Relative file path for artifacts that form a file tree (generated sites). */
    path: text("path"),
    mimeType: text("mime_type").notNull(),
    /** Small text artifacts are stored inline; large blobs go to storage. */
    contentText: text("content_text"),
    storageKey: text("storage_key"),
    sizeBytes: integer("size_bytes").notNull().default(0),
    version: integer("version").notNull().default(1),
    producedBy: text("produced_by").notNull(), // agent name
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("artifacts_mission_idx").on(t.missionId)],
);

// ---------------------------------------------------------------------------
// Credits and costs
// ---------------------------------------------------------------------------
export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    missionId: uuid("mission_id").references(() => missions.id, { onDelete: "set null" }),
    kind: ledgerKind("kind").notNull(),
    deltaBalance: integer("delta_balance").notNull().default(0),
    deltaReserved: integer("delta_reserved").notNull().default(0),
    reservationId: uuid("reservation_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    description: text("description").notNull().default(""),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("credit_ledger_idem_idx").on(t.orgId, t.idempotencyKey),
    index("credit_ledger_org_idx").on(t.orgId, t.createdAt),
    index("credit_ledger_reservation_idx").on(t.reservationId),
  ],
);

/** Raw provider usage, recorded by skills. Source of truth for real cost. */
export const providerCosts = pgTable(
  "provider_costs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    missionId: uuid("mission_id").references(() => missions.id, { onDelete: "set null" }),
    stepId: uuid("step_id").references(() => missionSteps.id, { onDelete: "set null" }),
    provider: text("provider").notNull(), // mock | anthropic | ...
    sku: text("sku").notNull(), // e.g. model id + token type
    unit: text("unit").notNull(), // input_tokens | output_tokens | seconds | request
    quantity: integer("quantity").notNull(),
    /** Null when the operator has not configured a rate for this sku. */
    costMicrosUsd: integer("cost_micros_usd"),
    credits: integer("credits").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("provider_costs_mission_idx").on(t.missionId)],
);

/** Operator-supplied price list. Never seeded with invented vendor prices. */
export const costRates = pgTable(
  "cost_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    sku: text("sku").notNull(),
    unit: text("unit").notNull(),
    costMicrosUsdPerUnit: integer("cost_micros_usd_per_unit"),
    creditsPerThousandUnits: integer("credits_per_thousand_units").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("cost_rates_provider_sku_idx").on(t.provider, t.sku, t.unit)],
);

// ---------------------------------------------------------------------------
// Durable execution
// ---------------------------------------------------------------------------
export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    idempotencyKey: text("idempotency_key").notNull(),
    status: jobStatus("status").notNull().default("queued"),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    lockedBy: text("locked_by"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    lastError: text("last_error"),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("jobs_idem_idx").on(t.idempotencyKey), index("jobs_claim_idx").on(t.status, t.runAt)],
);

/** Idempotency journal for side effects performed inside a step. */
export const toolInvocations = pgTable(
  "tool_invocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    missionId: uuid("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),
    stepId: uuid("step_id")
      .notNull()
      .references(() => missionSteps.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    tool: text("tool").notNull(),
    status: text("status").notNull(), // succeeded | failed
    input: jsonb("input").$type<unknown>(),
    output: jsonb("output").$type<unknown>(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tool_invocations_step_key_idx").on(t.stepId, t.key)],
);

// ---------------------------------------------------------------------------
// Connections, notifications
// ---------------------------------------------------------------------------
export const authConnections = pgTable(
  "auth_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // data | mailbox | whatsapp | instagram | youtube (src/server/connections/providers.ts)
    /** How the credential was obtained: "oauth" or "api_key". */
    kind: text("kind").notNull().default("api_key"),
    /** Human label shown in Connected apps (account email, masked key). Never the secret. */
    label: text("label"),
    externalAccountId: text("external_account_id"),
    scopes: jsonb("scopes").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** AES-256-GCM envelope (see src/server/secrets). Never returned to clients. */
    encryptedTokens: text("encrypted_tokens").notNull(),
    status: text("status").notNull().default("active"), // active | revoked | expired
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("auth_connections_org_idx").on(t.orgId, t.provider)],
);

/**
 * Every use of a connection: connect, scope preview, revoke, and each external
 * call made through it (one row per message sent or post published). Holds no
 * tokens; `detail` carries recipients, subjects and provider ids only.
 */
export const connectionAccessLog = pgTable(
  "connection_access_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id").references(() => authConnections.id, { onDelete: "set null" }),
    provider: text("provider").notNull(),
    action: text("action").notNull(), // connect | scope_preview | revoke | lead_search | send | publish | refresh
    actor: text("actor").notNull(), // "user:<id>" | "agent:<name>" | "system"
    missionId: uuid("mission_id").references(() => missions.id, { onDelete: "set null" }),
    stepId: uuid("step_id").references(() => missionSteps.id, { onDelete: "set null" }),
    outcome: text("outcome").notNull(), // ok | failed | denied
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("connection_access_log_org_idx").on(t.orgId, t.createdAt), index("connection_access_log_connection_idx").on(t.connectionId)],
);

/** Pending OAuth authorisations: the `state` ties the callback to the user who started it. */
export const oauthStates = pgTable(
  "oauth_states",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    state: text("state").notNull(),
    /** PKCE verifier, encrypted with the secrets envelope. */
    encryptedVerifier: text("encrypted_verifier").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("oauth_states_state_idx").on(t.state)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    missionId: uuid("mission_id").references(() => missions.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt)],
);

// Convenience type exports
export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Mission = typeof missions.$inferSelect;
export type MissionStep = typeof missionSteps.$inferSelect;
export type MissionEvent = typeof missionEvents.$inferSelect;
export type Approval = typeof approvals.$inferSelect;
export type Artifact = typeof artifacts.$inferSelect;
export type AuthConnection = typeof authConnections.$inferSelect;
export type ConnectionAccessLogEntry = typeof connectionAccessLog.$inferSelect;
export type LedgerEntry = typeof creditLedger.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type MissionStatus = Mission["status"];
export type StepStatus = MissionStep["status"];
export type MembershipRole = Membership["role"];
