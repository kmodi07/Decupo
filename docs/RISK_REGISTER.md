# Technical risk register

| ID | Risk | Likelihood | Impact | Mitigation / owner | Status |
|---|---|---|---|---|---|
| R-01 | Name "Decupo" fails trademark clearance, or the domain cutover breaks the owner's existing transcription service. **2026-11-21:** decupo.com is owned by the project owner (Cloudflare DNS, Paddle billing) and currently serves a Portuguese audio-transcription product. | Med | High | Trademark clearance before public launch; UI labels it a working name. Domain cutover is a separate migration: archive the existing site, export Paddle customers/subscriptions, keep the old service reachable, DNS change with rollback (see `DECISIONS.md`). | Open |
| R-02 | Credit accounting drifts from real provider cost (margin loss or over-charging) | High | High | Append-only ledger with reserve/settle; `provider_costs` records raw vendor usage; reconciliation report (Phase 6). | Mitigated in design |
| R-03 | Duplicate external side effects on retry (double publish, double email) | Med | High | `ctx.once()` idempotency journal in `tool_invocations`; Tier 3 actions gated by approvals; tests cover replay. | Mitigated |
| R-04 | Cross-tenant data leakage | Low | Critical | All services require `TenantContext`; RLS policies shipped; isolation tests. RLS is only *enforced* against a non-superuser Postgres role, which PGlite tests cannot fully emulate. | Partially verified |
| R-05 | No Docker/Postgres on dev machine slows integration testing | High | Med | PGlite for tests/dev; CI job against real Postgres is a backlog item (B-18). | Mitigated |
| R-06 | LLM provider unavailable or unaffordable at required quality | Med | High | Provider interface + offline mock; smallest-model-first routing; per-mission ceilings. | Mitigated in design |
| R-07 | YouTube/Google OAuth verification takes weeks and may restrict scopes | High | Med | Start verification early (Phase 5); keep publishing behind "needs connection"; never claim support before approval. | Open |
| R-08 | Sandbox escape from generated website code | Low | Critical | Website generator runs in an isolated container with no egress (Phase 4); Phase 1 skills do not execute user-provided code. | Not yet applicable |
| R-09 | Worker crash mid-step leaves missions stuck | Med | Med | Lease expiry + reaper; step re-run is idempotent; job-resume test. | Mitigated |
| R-10 | Hand-rolled auth has a subtle bug | Low | High | Small surface (scrypt, hashed sessions, origin check); tests; plan to add OIDC/WebAuthn via a vetted library when SSO is needed. | Accepted |
| R-11 | Next.js 16 / React 19 API churn breaks build | Med | Low | Versions pinned; minimal use of experimental features. | Accepted |
| R-12 | Users expect "a business in minutes"; product over-promises | Med | High | Status model distinguishes ready / in progress / blocked / partial / failed; estimates shown before authorisation; copy reviewed against blueprint section 1. | Open |
