# Decupo architecture (Phase 1 foundation)

## Shape
One TypeScript codebase, two processes:

```
+----------------------+    HTTP / SSE     +-------------------------+
|  Next.js app (web)   |<----------------->|  Browser (Mission       |
|  - App Router pages  |                   |  Control, Cupi intake)  |
|  - /api route handlers                   +-------------------------+
|  - auth, RBAC, tenancy
+----------+-----------+
           | shared domain modules (src/server/**)
           v
+----------------------+   poll + lease    +-------------------------+
|  PostgreSQL          |<----------------->|  Worker (src/worker.ts) |
|  tenant tables, jobs |                   |  step runner, skills,   |
|  ledger, events      |                   |  retries, idempotency   |
+----------------------+                   +-------------------------+
```

Both processes import the same domain code. Nothing talks to the database
except through `src/server/db` and the tenant-scoped services.

## Layers (src/server)
| Module | Responsibility |
|---|---|
| `db/` | Drizzle schema, driver selection (PGlite in dev/test, `pg` in prod), migrations. |
| `auth/` | Email + password (scrypt), opaque session tokens stored hashed, cookie handling, CSRF origin check. |
| `tenancy/` | `TenantContext { orgId, userId, role }`, RBAC `can(ctx, permission)`, membership lookup. Every service method takes a `TenantContext`. |
| `ledger/` | Append-only credit ledger: grant, reserve, settle, release, adjustment. Serialised per organisation with a row lock. |
| `missions/` | Mission aggregate: state machine, step graph (DAG by step key), events, approvals, artifacts, budget ceiling. |
| `planner/` | Cupi intake. `Planner` interface; `RuleBasedPlanner` (offline) today, LLM planner adapter when a provider key exists. Produces a plan + estimate, never executes. |
| `skills/` | Skill manifests (id, version, agent, permission scopes, cost model, timeout, requires approval) and implementations. Skills receive a `SkillContext` (tenant, inputs, `once()` idempotency helper, artifact writer, LLM provider). |
| `policy/` | Action classes (publish, deploy, spend, send, delete, ...) and the rule that Tier 3 actions always create an approval unless a stored pre-authorisation matches. |
| `jobs/` | Durable queue on a Postgres table: `enqueue`, `claim` (FOR UPDATE SKIP LOCKED + lease), `complete`, `fail` with backoff, `reapExpiredLeases`. |
| `worker/` | Step runner: claims a job, re-checks mission status (paused/canceled), reserves credits, runs the skill, settles credits, writes events, schedules dependants. |
| `secrets/` | AES-256-GCM envelope encryption with a key from `SECRETS_MASTER_KEY`. Used for connector tokens (Phase 5). |
| `storage/` | Artifact blob storage interface; local-disk driver in Phase 1, S3-compatible driver later. |
| `llm/` | `LlmProvider` interface, `MockLlmProvider` (deterministic, clearly labelled output), Anthropic adapter (enabled by env). |

## Tenancy model
`organizations` -> `workspaces` -> `missions`. Users join organisations via
`memberships` with a role (`owner`, `admin`, `member`, `viewer`). Every tenant
table carries `org_id`. Services filter by `ctx.orgId` on every query, and
migrations enable Postgres RLS keyed on `app.current_org_id` for defence in depth.

## Mission lifecycle
```
draft -estimate-> estimated -request-> awaiting_authorization -authorize-> queued
queued -worker-> running -all steps done-> completed | partially_completed | failed
running -approval needed-> awaiting_review -decision-> running
running|queued|awaiting_review -pause-> paused -resume-> queued
any non-terminal -cancel-> canceled
```
Authorisation reserves the estimated credits for the whole mission. Each step
settles actual usage against the mission reservation when it finishes; when the
mission reaches a terminal state the unused remainder is released, which is the
refund path for unrun or failed steps. The mission budget ceiling
(`missions.budget_ceiling_credits`) bounds total reservation.

## Durable execution
- Steps are rows; a job is `{kind: "run_step", stepId}` with an idempotency key `step:<id>:attempt:<n>`.
- Claiming sets `locked_by`/`lease_expires_at`; a crashed worker's lease expires and the job is reclaimed.
- Skills perform external side effects only inside `ctx.once(key, fn)`, which records the result in `tool_invocations` before returning; a retried step replays the recorded result instead of repeating the action.
- Retries use exponential backoff up to `max_attempts`; after that the step fails and the mission is evaluated.

## Events and updates
`mission_events` is append-only with a per-mission sequence. The UI subscribes
through `GET /api/missions/:id/events` (Server-Sent Events, backed by polling
the table with `Last-Event-ID`), so updates survive reloads and work across
processes with no extra broker.

## Security defaults
- Cookies: `HttpOnly`, `SameSite=Lax`, `Secure` outside dev. Session tokens are 256-bit random, stored as SHA-256.
- Mutating `/api` requests must carry an `Origin` matching the app origin.
- Passwords: scrypt (N=2^15, r=8, p=1) with per-user salt; constant-time compare.
- Input validation with zod at every route boundary.
- No tenant data in URLs beyond opaque UUIDs; no secrets in logs.
