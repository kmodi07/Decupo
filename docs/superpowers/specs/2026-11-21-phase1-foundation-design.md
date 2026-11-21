# Phase 1 foundation design — 2026-11-21

## Intent
Turn the Decupo blueprint into a running, tested multi-tenant foundation: a
user signs up, describes a goal to Cupi, gets a plan with a credit estimate,
authorises it, watches bounded steps execute with live updates, reviews
artifacts, and can pause or cancel. Website, presentation and YouTube
workflows come later on top of this engine; nothing in Phase 1 pretends they
already work.

## Goals
- Secure auth and tenant isolation that tests can prove.
- Mission engine with persistent statuses, a step graph, durable execution,
  retries, idempotency, approvals and an event stream.
- Credit ledger with estimate -> reserve -> settle -> release, no negative balance.
- Premium Decupo/Cupi identity as reusable components.
- Runs on this machine with no Docker or Postgres install.

## Non-goals (Phase 1)
Real website/deck generation, OAuth connectors, publishing, billing, email.

## Anti-goals
Faking completion, hiding failed steps, hard-coding vendor prices as facts,
granting any blanket credential access.

## Constraints
No Docker/Postgres locally; npm only; Windows dev box; no API keys present.

## Approaches considered
1. **Single Next.js app + worker process sharing `src/server` (chosen).**
   Smallest surface, one build, one deploy unit plus a worker. Clear path to
   split later.
2. Monorepo with separate packages (`db`, `core`, `web`, `worker`). Cleaner
   boundaries but more tooling friction on Windows/npm and slower to iterate
   for a solo founder.
3. Temporal/Inngest for durable execution from day one. Strong guarantees but a
   second service to run and no local Docker; deferred behind the job
   interface.

Data layer: Drizzle ORM with PGlite (dev/test) and `pg` (prod) — chosen over
Prisma because the same schema runs in-process for tests without a server.
Auth: own session auth with Node `scrypt` — chosen over a third-party auth
service to keep tenant data and secrets in one place; OIDC can be added later.

## Decisions
- Status vocabulary follows blueprint section 3 exactly.
- Every service takes a `TenantContext`; RLS policies added in SQL.
- Ledger entries carry `delta_balance` and `delta_reserved`; balance and reserved
  are sums; `available = balance - reserved` is checked under a per-org row lock.
- Jobs table with leases; `once()` idempotency journal for side effects.
- Tier 3 action classes always require an approval row in Phase 1.
- Planner is rule-based and offline; LLM provider is an interface with a mock.
- Cost model lives in a config table so pricing is operator-supplied, not invented.

## Left to the builder
Component naming, exact Tailwind tokens, SSE polling interval, migration file
layout, test fixtures.
