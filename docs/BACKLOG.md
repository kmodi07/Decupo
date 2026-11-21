# Milestone plan and implementation backlog

Status key: done / in progress / not started / blocked (reason). Statuses are
updated at the end of each build iteration; see the bottom of this file for the
date of the last update.

## M1 - Foundation (Phase 1)
| ID | Item | Status |
|---|---|---|
| B-01 | Repo audit, architecture, risk register, backlog | done |
| B-02 | Next.js 16 + TypeScript + Tailwind scaffold, lint, vitest | done |
| B-03 | Drizzle schema: orgs, users, memberships, workspaces, sessions, missions, steps, events, approvals, artifacts, ledger, jobs, tool_invocations, provider_costs, notifications | done |
| B-04 | PGlite/pg driver switch + SQL migrations + RLS policies | done |
| B-05 | Auth: signup, login, logout, sessions, origin check | done |
| B-06 | Tenancy: TenantContext, RBAC permissions, membership roles | done |
| B-07 | Credit ledger: grant / reserve / settle / release, no-negative invariant | done |
| B-08 | Mission state machine + step DAG + events + approvals | done |
| B-09 | Durable job queue with leases, retries, backoff, reaper | done |
| B-10 | Worker step runner with reserve/settle and `once()` idempotency | done |
| B-11 | Rule-based Cupi planner with estimates and "needs connection" flags | done |
| B-12 | Skills: brand-brief, research-memo, site-outline, deck-outline (mock LLM); manifests + tests | done |
| B-13 | API: missions, estimate, authorize, pause, resume, cancel, events (SSE), artifacts, approvals, ledger | done |
| B-14 | Mission Control UI: landing, auth, mission list, mission detail with live timeline, approvals, credits | done |
| B-15 | Design system components from brand palette + mascot | done |
| B-16 | Secrets envelope encryption helper | done |
| B-17 | README with run/test instructions and honest status | done |
| B-18 | CI workflow running vitest against PGlite and a Postgres service (RLS enforcement test) | in progress (PGlite CI added; Postgres service job pending) |
| B-19 | Email verification + password reset | blocked (no mail provider) |

## M2 - First real outcomes (Phase 2)
| ID | Item | Status |
|---|---|---|
| B-20 | Anthropic provider wired to planner/skills with token metering into `provider_costs` | blocked (`ANTHROPIC_API_KEY` not set; adapter stubbed) |
| B-21 | Website generator: template engine -> static site files, accessibility + link checks, local preview, deploy approval gate | done (`site-build` + `site-check` skills, tenant-scoped preview route with script-blocking CSP; copy is an offline draft until B-20 lands) |
| B-22 | Sandboxed build step (container with no egress) for generated sites | not started (still pending: generation is template-based and executes no user code, so no sandbox is needed yet; required before custom code or framework builds are accepted) |
| B-23 | Presentation generator: research with citations -> editable deck (pptx export), QA check for uncited claims | not started |
| B-24 | Artifact versioning + download UI | not started |
| B-26 | Buyer-finding missions: offer sheet, buyer map by product family, outreach drafts in English/Hindi/Gujarati; lead search and sending behind connections and per-batch approval | done (end to end against the mock adapters: lead search fills the lead list, one approved batch is sent and every message is logged; live sending waits on an operator enabling the Gmail / WhatsApp adapters, B-30) |
| B-27 | Social missions for local businesses: local market research, weekly reel plan in the seller's language; posting behind account connection and per-reel approval | done (planning, plus posting of one approved reel from a user-supplied video link through the Instagram / YouTube adapters, B-30); blocked (video rendering; live YouTube needs Google verification, B-31) |
| B-25 | Vale validator skill (independent QA pass) | in progress (`qa-review` for documents, `site-check` for generated sites; LLM-assisted review pending B-20) |

## M3 - Connected automations (Phase 3)
| ID | Item | Status |
|---|---|---|
| B-30 | OAuth connector framework (encrypted tokens, scope preview, revoke, access log) | done (`src/server/connections`: provider registry for data / mailbox / whatsapp / instagram / youtube, API-key and OAuth+PKCE connect, revoke, `connection_access_log`, Connected apps page; adapters behind `CONNECTOR_<PROVIDER>_ADAPTER=mock` or `=live`; live adapters are written against the documented HTTP APIs but have not been exercised against real accounts from this repository) |
| B-31 | Google OAuth + YouTube publisher behind verification, quota meter, content-policy check | in progress (OAuth client flow and private-upload adapter exist behind `CONNECTOR_YOUTUBE_ADAPTER`); blocked (Google Cloud project, app verification, quota metering and the content-policy check) |
| B-32 | Pre-authorisation policies (Tier 2) with limits | not started |
| B-33 | Notifications: in-app + email opt-in | not started |

## M4 - Monetisation and operations (Phase 4)
| ID | Item | Status |
|---|---|---|
| B-40 | Stripe subscriptions + credit packs, webhook-driven grants | blocked (needs Stripe account) |
| B-41 | Cost reconciliation report, budget alerts, low-balance alerts | not started |
| B-42 | Admin console: missions, failures, costs, abuse signals | not started |
| B-43 | Observability: structured logs, traces per mission, error tracking | not started |

## M5 - Test and hardening gates (continuous)
| ID | Item | Status |
|---|---|---|
| B-50 | Tenant isolation tests | done (service + HTTP + RLS under app role) |
| B-51 | Permission boundary tests | done |
| B-52 | Job-resume after worker crash test | done |
| B-53 | Credit accounting invariants test | done |
| B-54 | Cancellation releases reservations test | done |
| B-55 | No unapproved Tier 3 action test | done |
| B-56 | E2E browser tests (Playwright) | not started |
| B-57 | Load test of worker throughput | not started |
| B-58 | Security review / dependency audit in CI | not started |

Last updated: 2026-11-21 (Phase 3 iteration 1: connector framework B-30 done, 69 tests passing, production build green).
