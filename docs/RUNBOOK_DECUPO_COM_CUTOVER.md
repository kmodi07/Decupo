# Runbook: moving decupo.com from the transcription service to Decupo

**Status:** draft, not approved. Nothing in this runbook has been executed; no
Cloudflare or Paddle setting has been changed.
**Owner:** acting CEO (domain, Cloudflare and Paddle account holder).
**Inventory source:** read from the Cloudflare dashboard on 2026-11-21 (read-only).
Items marked `[fill in]` could not be read there and need the owner or the
Paddle dashboard.

The rule from `DECISIONS.md`: preserve the existing product, its customers,
subscriptions and payment configuration before anything is replaced.

---

## 0. Decisions needed before any step runs

| # | Decision | Options | Decided |
|---|---|---|---|
| D1 | Where does the transcription service live after cutover? | (a) a subdomain such as `transcreve.decupo.com`; (b) a new domain; (c) retired, with refunds | `[fill in]` |
| D2 | Does it keep selling to new customers? | yes / existing customers only / no | `[fill in]` |
| D3 | How are existing customers told, and how far in advance? | email from the Paddle customer list, in-app banner, both | `[fill in]` |
| D4 | Naming. The transcription product already lives under the Decupo name (its staging Worker is `decupo-staging`). Two products under one name on one domain will confuse customers and search results. | keep both under Decupo with clear sub-brands / rename the transcription service / rename the new product | `[fill in]` |
| D5 | Does Decupo bill through Paddle (already set up, live) or Stripe (blueprint assumption)? | Paddle / Stripe / later | `[fill in]` |

If D1 is (c), add a legal and refund step before section 4; this draft assumes (a) or (b).

## 1. Inventory

### 1.1 Current site (verified in Cloudflare)
- **Hosting:** a Cloudflare Worker named `transcreve`, bound to the custom domains `decupo.com` and `www.decupo.com` (Workers custom domains, proxied). Compatibility date 2026-10-01, flag `nodejs_compat`, placement default, no cron triggers, no queue consumers, no email triggers.
- **Deployment history:** 17 production deployments in the last 14 days, the latest 3 days ago. The product is actively developed and live.
- **Staging:** a second Worker `decupo-staging` with the same code shape, Paddle in sandbox mode, its own KV namespace (`KV_STAGING`) and Durable Object class (`decupo-staging_Quota`). It has no custom domain in the decupo.com zone.
- **State (this is the customer data):**
  - KV namespace binding `KV` (production namespace named `KV`).
  - Durable Object binding `QUOTA`, class `transcreve_Quota` (per-user quota and usage).
  - No D1 database, no R2 bucket, no Hyperdrive. Uploaded audio is therefore not stored long-term by Cloudflare storage bindings; confirm in the code whether audio is streamed to the transcription provider and discarded: `[fill in]`.
- **Secrets and variables (names only, values stay in Cloudflare):** `GROQ_API_KEY` (transcription provider), `PADDLE_WEBHOOK_SECRET`, `SESSION_SECRET`, `STATS_TOKEN`; variables `PADDLE_ENV=production`, `PADDLE_CLIENT_TOKEN` (live client token), `PADDLE_PRICE_MONTHLY`, `PADDLE_PRICE_YEARLY`, and free-tier quota settings (`FREE_*`, `PAID_MONTHLY_SECONDS`).
- **Source control:** no Git repository is connected to the Worker in Cloudflare (deploys appear to come from the CLI). Repository and branch that match production: `[fill in]`.
- **Third-party integrations tied to the domain:** Paddle (checkout and webhooks), Groq (API key only, no domain dependency known). Others: `[fill in]`.
- **Customers:** active paid subscriptions and monthly active users: `[fill in from Paddle and the STATS endpoint]`.

### 1.2 Cloudflare zone decupo.com (verified)
Plan: Free. DNS setup: Full. 7 records:

| Name | Type | Content | Proxy | Depends on it |
|---|---|---|---|---|
| decupo.com | MX x3 | route1/2/3.mx.cloudflare.net | DNS only | Cloudflare Email Routing |
| decupo.com | TXT | SPF `v=spf1 include:_spf.mx.cloudflare.net ~all` | DNS only | Email Routing |
| cf2024-1._domainkey | TXT | DKIM key | DNS only | Email Routing |
| decupo.com | Worker | `transcreve` | Proxied | The transcription site |
| www.decupo.com | Worker | `transcreve` | Proxied | The transcription site |

- **Email Routing:** enabled, 1 routing rule, 1 destination address, DNS records locked by Email Routing. Which address forwards where: `[fill in]`. Last 7 days: 2 messages received, 1 forwarded, 1 error.
- Cloudflare recommends adding a **DMARC** record; none exists. Add it as part of the cutover (`v=DMARC1; p=none; rua=mailto:...` first, tighten later).
- Redirect Rules, Page Rules, Workers Routes, SSL/TLS mode, HSTS, DNSSEC, registrar lock and auto-renew: not read yet, `[fill in]` (Rules and SSL/TLS pages of the zone).
- Zone export: Cloudflare dashboard, DNS, Records, Export. Save as `archive/dns/decupo.com-<date>.txt`.

### 1.3 Paddle (not yet read; confirm in the Paddle dashboard)
Paddle Billing is in use (price IDs have the `pri_` form, and the Worker uses a client token and `PADDLE_ENV`).
- Approved website domains for checkout: `[fill in]` (expect decupo.com)
- Default payment link and the page it points at: `[fill in]`
- Notification destinations (webhooks) pointing at decupo.com and the events they carry: `[fill in]` (the Worker verifies them with `PADDLE_WEBHOOK_SECRET`)
- Products and prices: one monthly and one yearly price in production, matching sandbox pair in staging: `[fill in names and amounts]`
- Customer portal and subscription-management links sent in receipts: `[fill in]`
- Tax, invoicing and business details tied to the current product name: `[fill in]`

## 2. Preservation (do all of this before touching DNS)

1. **Source.** In the repository that deploys `transcreve`, tag the production commit (`git tag cutover-baseline-<date>`), push the tag, keep a zipped clone outside this repository. If the production code is not in a repository, download it: Worker, Deployments, latest version, Download. `[fill in repo]`
2. **KV data.** Export every key of the production `KV` namespace. With Wrangler: `npx wrangler kv key list --namespace-id <id>` then `wrangler kv key get` per key (script it), or bulk export via the Cloudflare API. Store under `archive/kv/<date>/`. Record the key count here: `[fill in]`.
3. **Durable Object data.** `transcreve_Quota` state cannot be exported from the dashboard. Add a temporary, token-protected export route to the Worker (or extend the existing `STATS_TOKEN` endpoint) that dumps each object's storage as JSON, run it once, remove the route, and store the output under `archive/durable-objects/<date>/`. Do this on `decupo-staging` first.
4. **Paddle exports.** From the Paddle dashboard export Customers, Subscriptions and Transactions as CSV; also pull them through the Paddle API if an API key exists, so the archive is machine-readable. Store under `archive/paddle/<date>/`. Record counts here: `[fill in]`.
5. **DNS and settings.** Zone export from 1.2, plus screenshots of Email Routing rules, SSL/TLS, Rules and the Worker's variables page (names only).
6. **Secrets.** Secret values are not readable from Cloudflare. Confirm each (`GROQ_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `SESSION_SECRET`, `STATS_TOKEN`) exists in the password manager; rotate any that do not.
7. **Legal.** Confirm retention and privacy obligations for existing customer data (Portuguese-speaking customers may fall under GDPR or LGPD) and whether the terms of service require notice for a domain move. `[fill in counsel's answer]`

Archive location (outside this repository): `[fill in]`.

## 3. Stand the old service up at its new address (D1)

1. In the `transcreve` Worker, Domains tab, add the new custom domain (for example `transcreve.decupo.com`). Cloudflare creates the DNS record and certificate. Do not remove the apex and `www` bindings yet.
2. Update the app's own configuration for the new hostname: base URL in emails and receipts, cookie domain if set, any absolute links. Deploy to `decupo-staging` first, then production.
3. In Paddle, add the new hostname to the approved domains, update the default payment link, and add a second notification destination on the new hostname next to the old one. Test a checkout in the sandbox through `decupo-staging`, then one live test transaction (and refund it).
4. Smoke test as a customer: sign in, transcribe a short file, open billing, see the subscription, receive the result.
5. Run old and new addresses in parallel across at least one renewal date and watch webhook delivery in Paddle.

## 4. Customer communication (D3)

- T-14 days: email all active customers (Paddle export) with the new address, the date, and what does not change (price, subscription, history).
- T-7 days: banner in the transcription app linking to the new address.
- T-0: final email; redirects in place (5.3) so old bookmarks and Paddle links keep working.

## 5. Cutover (T-0)

Pre-conditions: sections 2 to 4 complete; Decupo deployed to its production host with `APP_ORIGIN=https://decupo.com`, `DATABASE_DRIVER=pg`, migrations applied, worker running; a staging hostname for Decupo proven first (for example `app-staging.decupo.com`).

5.1 Nothing to pre-warm: the web records are proxied Workers custom domains and switch immediately. MX, SPF and DKIM are not touched.

5.2 Move the apex and `www`: remove `decupo.com` and `www.decupo.com` from the `transcreve` Worker's Domains tab, then attach them to Decupo's host (a Worker custom domain, a Pages project, or a DNS record to an external host, depending on where Decupo is deployed; see section 8).

5.3 Add Cloudflare Redirect Rules (301) from the transcription service's paths on `decupo.com` to the new hostname so customer bookmarks, receipts and Paddle links keep working. Keep them for at least 12 months. Decupo's own routes (`/`, `/app`, `/api`, `/login`, `/signup`) must not be caught by these rules; list the old paths explicitly: `[fill in from the Worker's router]`.

5.4 Paddle: once redirects are verified, keep decupo.com in the approved domains until logs show no checkout traffic from it for a week, then remove it; retire the old notification destination the same way.

5.5 Add the DMARC record (1.2). Verify (section 7). Announce. Watch both Workers' metrics and Decupo's error logs for 48 hours.

## 6. Rollback

Trigger: checkout failures, webhook failures, or the transcription service unreachable for customers.

1. Re-attach `decupo.com` and `www.decupo.com` to the `transcreve` Worker (Domains tab). Proxied custom domains take effect within seconds.
2. Disable the redirect rules.
3. Restore Paddle approved domains and payment link if they were changed.
4. Decupo stays reachable on its staging hostname meanwhile.

## 7. Verification checklist

- [ ] `https://decupo.com` and `https://www.decupo.com` serve Decupo with a valid certificate.
- [ ] Old transcription URLs redirect with 301 to the new hostname and land on a working page.
- [ ] A Paddle checkout for the transcription service completes at the new hostname; its webhook arrives and is accepted.
- [ ] An existing subscriber signs in at the new hostname and sees their subscription and remaining quota (Durable Object state intact).
- [ ] Email Routing still forwards (send a test to the routed address); SPF and DKIM unchanged; DMARC added.
- [ ] Decupo sign-up, mission creation and a worker-run mission succeed in production.
- [ ] Metrics for both Workers and Decupo's error logs are quiet for 48 hours.

## 8. Open items for the build team

- **Hosting choice for Decupo: decided (2026-11-21).** Decupo runs on Cloudflare Workers through OpenNext as the Worker `decupo-app`, with Postgres on Neon reached through the Neon serverless driver, and the step runner split into a request-time kick plus a one-minute cron. It is live at `https://decupo-app.transcreve.workers.dev` only; see `DEPLOY_CLOUDFLARE.md`. Section 5 would point the apex at this Worker.
- **Billing.** Decupo has no billing yet (backlog B-40). Paddle is live in this account with webhook verification already implemented in the transcription Worker; D5 decides whether to reuse it.
- `APP_ORIGIN` must match the final hostname or every POST is rejected by the origin check.
- Naming (D4) should be settled before any customer email mentions "Decupo".
