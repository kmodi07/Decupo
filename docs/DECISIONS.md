# Decision log

Decisions made by the acting CEO (the project owner) and the build team. Newest first.

## 2026-11-21 — Acting CEO: founding decisions
1. **Brand.** Decupo feels premium, friendly and approachable. Cupi is the recognisable AI companion.
2. **Product.** Work is organised into persistent Missions with specialist agents, progress updates, approvals, deliverables and transparent credit usage.
3. **Business.** A product people can actually use and pay for comes before a long list of non-functional features. The planner therefore labels unavailable capabilities as *Not yet* or *Needs a connection* rather than shipping stubs.

## 2026-11-21 — Domain finding: decupo.com is in use
`www.decupo.com` currently serves a Portuguese-language audio transcription service
("transcrição de áudio em português"), reported by the acting CEO.

Consequences and rules:
- The build does **not** depend on that domain. Nothing in the code, docs or copy claims decupo.com, and no domain is to be registered, redirected or replaced as part of this project without an explicit, separate decision.
- **If the project owner controls decupo.com:** before any repurposing, export and archive the existing site's source, customer records, subscriptions and payment-provider configuration; notify existing customers; keep the archive outside this repository. Treat it as a migration project with its own plan.
- **If the project owner does not control decupo.com:** the name is in commercial use by an unrelated service, which raises the trademark-confusion risk (R-01). Options are a different domain under the same name after clearance, or a different name. Decision pending.
- **Update, same day:** the acting CEO confirms they own decupo.com. It was bought on Cloudflare (DNS there) and is linked to Paddle, so the existing transcription service bills its customers through Paddle. Repurposing the domain is therefore a migration of the owner's own product, not a naming conflict:
  1. Export the existing site's source and content to an archive outside this repository.
  2. Export Paddle customer, subscription and transaction records; confirm how active subscriptions continue to be served (keep the transcription service reachable on a subdomain or a separate domain before the apex changes).
  3. Plan the Cloudflare DNS change (apex and `www`) with a rollback, and keep existing email/DNS records that unrelated services depend on.
  4. Only then point decupo.com at Decupo. Until that plan is approved, the app stays on its local/dev origin.
- Paddle (merchant of record) is now a candidate for Decupo's billing alongside Stripe when backlog item B-40 is scoped. No decision yet.
- **Inventory read from Cloudflare (same day, read-only):** the transcription service is a Cloudflare Worker named `transcreve` bound to `decupo.com` and `www.decupo.com`, with customer state in a KV namespace and a Durable Object, Paddle Billing in production, and a `decupo-staging` twin on the Paddle sandbox. Email on the domain uses Cloudflare Email Routing. Full inventory and the step-by-step plan: `RUNBOOK_DECUPO_COM_CUTOVER.md`. Open decisions D1 to D5 in that runbook block execution.

## 2026-11-21 — Build team: Phase 1 stack
See `docs/superpowers/specs/2026-11-21-phase1-foundation-design.md` (single Next.js app plus worker, Drizzle with PGlite locally and PostgreSQL in production, own session auth, offline LLM mock until a provider key exists).
