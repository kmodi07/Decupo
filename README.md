# Decupo

**Say the dream. Watch it happen.** Decupo turns a short goal into a Mission:
Cupi plans it, estimates credits, waits for your go-ahead, then specialist
agents run bounded steps with live updates, approvals for anything
consequential, and a ledger that reserves, settles and releases credits.

> Status: **Phase 1 foundation.** Auth, tenancy, mission engine, durable
> worker, credit ledger, approvals, event stream and Mission Control UI are
> implemented and tested. Real website/deck generation, OAuth connectors,
> publishing and billing are not built yet; the planner shows those as
> *not available* or *needs connection* instead of pretending.
> "Decupo" is a working name and has not been cleared for trademark or domain use.

## Run it locally (no Docker or Postgres needed)

```powershell
npm install
copy .env.example .env
npm run dev
```

Open http://localhost:3000, sign up, and give Cupi a goal. The default
`DATABASE_DRIVER=pglite` runs an embedded Postgres in `./data/pglite` and the
worker runs inside the web process. Without an LLM key every agent uses an
**offline mock** whose output is labelled as such.

### Production shape

- `DATABASE_DRIVER=pg` + `DATABASE_URL` pointing at managed PostgreSQL.
  Connect as a non-owner role (the migrations create `decupo_app`) so the
  row-level-security policies are enforced.
- Run `npm run db:migrate`, `npm run build && npm start` for the web app, and
  `npm run worker` (one or more) with `WORKER_INLINE=false`.
- Set real `SESSION_SECRET` and `SECRETS_MASTER_KEY` values.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server with inline worker (PGlite) |
| `npm test` | Vitest suite against in-memory PGlite (28 tests) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:generate` | Generate SQL migrations from `src/server/db/schema.ts` |
| `npm run db:migrate` | Apply migrations with the configured driver |
| `npm run worker` | Standalone worker (requires `DATABASE_DRIVER=pg`) |

## What is tested

- Tenant isolation at the service and HTTP layers, plus RLS under the app role.
- Role permissions (owner / admin / member / viewer).
- Credit ledger: no negative balance, idempotent reserve/settle/release, overage capping.
- Mission lifecycle: plan, authorise, run, approvals (approve and reject), pause, resume, cancel.
- Durable execution: retry with backoff, side-effect replay through `once()`, lease expiry recovery, budget ceiling blocking.
- HTTP API: cookies, CSRF origin check, SSE event stream, artifact download.

## Layout

```
src/app            Next.js App Router pages and /api route handlers
src/components     Design system (Decupo/Cupi identity)
src/server/db      Drizzle schema, driver switch, migrations (./drizzle)
src/server/auth    Passwords, sessions, CSRF
src/server/tenancy TenantContext and RBAC
src/server/ledger  Credit ledger
src/server/missions State machine, events, mission service
src/server/jobs    Durable queue
src/server/worker  Step runner
src/server/skills  Manifests and built-in skills
src/server/planner Cupi's rule-based planner
src/server/policy  Action classes and tiers
src/server/llm     Provider interface + offline mock
src/server/secrets AES-256-GCM envelope helper
docs/              Audit, architecture, risk register, backlog, design specs
```

See `docs/BACKLOG.md` for what is done, in progress, and blocked.
