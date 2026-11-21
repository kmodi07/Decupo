# Decupo

**Say the dream. Watch it happen.** Decupo turns a short goal into a Mission:
Cupi plans it, estimates credits, waits for your go-ahead, then specialist
agents run bounded steps with live updates, approvals for anything
consequential, and a ledger that reserves, settles and releases credits.

> Status: **Phase 1 foundation + Phase 2 outcomes + connector framework.** Auth,
> tenancy, mission engine, durable worker, credit ledger, approvals, event
> stream and Mission Control UI are implemented and tested. Website missions
> generate a real multi-page static site with an offline quality check and a
> private preview. Buyer-finding and social missions run end to end against
> connected accounts: the connector framework (`src/server/connections`)
> stores tokens encrypted, previews scopes, revokes, and logs every external
> call. Live adapters for a lead-data contract, Gmail, WhatsApp Cloud API,
> Instagram Graph and YouTube exist but are switched off until an operator sets
> `CONNECTOR_<PROVIDER>_ADAPTER=live` with the provider's client keys; they have
> not been run against real accounts from this repository. Deck generation and
> billing are not built; the planner shows those as *not available* or *needs
> connection* instead of pretending. Without an LLM key the copy is an offline
> draft and the quality review says so.
> "Decupo" is a working name and has not been cleared for trademark or domain use.

## Deployment policy

Never modify www.decupo.com, its DNS, customer data, billing or the existing
services behind it without an approved migration and backup plan. See
`docs/RUNBOOK_DECUPO_COM_CUTOVER.md`.

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
| `npm test` | Vitest suite against in-memory PGlite (69 tests) |
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
- Website generator: the generated site passes `site-check` (internal links, image alt text, one h1 per page, lang, title, viewport); a deliberately broken page fails it with every finding listed; the contact form is marked as not connected and no prices are invented.
- Preview route: serves generated files only to the owning tenant with a script-blocking Content-Security-Policy, 404 for other tenants and unknown paths, 401 when signed out.
- Buyer-finding mission: offer facts are parsed from the goal and answers, never guessed; the buyer map names no contacts; outreach drafts carry the seller's figures (English, Hindi or Gujarati) and placeholders only where facts are missing; lead search blocks without a data connection and the send step is skipped, never attempted, with no approval created.
- Buyer-finding mission with mocked providers: lead search fills the lead list from the connected provider, the mission stops at `awaiting_review` before anything is sent, and after one approval the batch goes out once, with the sent count on the step and one access-log row per message; a provider outage mid-batch retries the step without resending what already went.
- Connections: API keys and OAuth tokens are stored as AES-256-GCM envelopes and never appear in any API response or log; the OAuth flow uses PKCE and a single-use state tied to the user who started it; connecting again replaces the earlier connection; revoke works; another tenant cannot list, revoke or use a connection; only owners and admins can connect or revoke; a connection whose adapter the server has not enabled blocks the step with that reason.
- Social mission: a reel plan in the chosen language, an approval before posting, a `blocked` result without an Instagram or YouTube connection or without a video link, and exactly one post through a mocked Instagram account when both exist.
- Full website mission: brand brief, outline, build, check, then `awaiting_review` at the approval-gated deploy step with the site files and quality review present; after approval the deploy step reports `blocked` (no hosting connection), never a fake success.

## Connected apps

Missions that contact anyone or post anywhere need an account the workspace
owner connects under **Connected apps**. Each provider shows the exact scopes
it asks for and why before connecting; tokens are encrypted at rest with
`SECRETS_MASTER_KEY`, every use is written to `connection_access_log`, and
revoking is one click. Sending and posting stay Tier 3: one approval per batch
or reel, and each message is journaled through `once()` so a retry never sends
twice.

The server decides which providers can be connected:

| Env | Provider | Live adapter needs |
|---|---|---|
| `CONNECTOR_DATA_ADAPTER=live` | Lead data (user's own API key) | `LEAD_DATA_API_URL` speaking the lead contract in `src/server/connections/adapters/live.ts` |
| `CONNECTOR_MAILBOX_ADAPTER=live` | Gmail send (OAuth, `gmail.send` only) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, Google app verification |
| `CONNECTOR_WHATSAPP_ADAPTER=live` | WhatsApp Business Cloud API (system-user token) | verified Meta Business account; cold messages need approved templates |
| `CONNECTOR_INSTAGRAM_ADAPTER=live` | Instagram reels (Graph API) | Meta app review for publishing; a public video URL |
| `CONNECTOR_YOUTUBE_ADAPTER=live` | YouTube upload (OAuth, private by default) | Google project with Data API quota and verification |

`=mock` runs a deterministic offline adapter whose output is labelled test data
(used by the test suite). Unset means the provider is listed as *not available
here* and every step that needs it blocks with that reason.

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
src/server/skills  Manifests and built-in skills (site/ holds the pure site generator and checker)
src/server/connections Provider registry, encrypted connections, OAuth/API-key connect, revoke, access log, adapters (mock + live)
src/server/planner Cupi's rule-based planner
src/server/policy  Action classes and tiers
src/server/llm     Provider interface + offline mock
src/server/secrets AES-256-GCM envelope helper
docs/              Audit, architecture, risk register, backlog, design specs
```

See `docs/BACKLOG.md` for what is done, in progress, and blocked.
