# DECUPO — Product Blueprint v0.1
**Positioning:** Say the dream. Watch it happen.
**Product category:** Multi-agent AI workforce for founders, creators, students, professionals, and teams.
**Assistant mascot:** Cupi — friendly user-facing orchestrator, not a human impersonation.
**Status:** Product proposal and interactive front-end demo; not a production service.

## 1. The promise and what it means
Users write a brief outcome: “Launch my tutoring company,” “Build me a beautiful website,” “Create a cited economics presentation,” “Plan 10 YouTube Shorts daily,” or “Find and prepare outreach to qualified sales prospects.”

Cupi converts the goal into a **Mission**, selects reusable skills, assigns specialist agents, requests the few missing essentials, estimates credits, executes permitted steps using connected tools, tests the results, and sends progress updates. The system must be honest about the difference between a first artifact built in minutes and a real business or sustained audience growth, which require time, approvals, market responses, and often external spending.

**Primary differentiator:** Not just generate an output—persistently work toward an outcome, with skill selection, visible agent handoffs, auditable external actions, quality gates, and credit budgets.

## 2. Product capabilities (planned)

### A. Build & launch
- Goal-to-brand generator: business positioning, naming suggestions, visual identity, design system.
- Production-grade websites: responsive pages, semantic SEO, forms, payment links, analytics, CMS, tests, domains, previews, accessibility checks, code export.
- App building: authentication, dashboards, CRUD, APIs, databases, test coverage, staging, deployment with approval.
- E-commerce: catalog drafts, product pages, checkout via user's Stripe account or commerce platform.
- Sales collateral: pitch decks, one-pagers, proposals, demo scripts.

### B. Create & publish
- Content calendar, trend research, source verification, scripts, storyboards, subtitles, thumbnails, voiceovers (licensed/consented), editing/rendering, scheduled uploads, performance review.
- Google/YouTube and Meta integrations where the account type, API permissions, reviews, quota, and content policies permit.
- Multiple publishing cadence templates, including a request for 10 YouTube Shorts per day. Show feasibility, source-content needs, costs, and posting limits before activation.
- Documents, PDFs, slide decks, budgets, spreadsheets, reports, data charts.

### C. Sell & operate
- Ethical prospect research, lead qualification, CRM hygiene, personalized email drafts, follow-up tracking.
- Appointment proposals and calendar scheduling; outbound messages and calls only after applicable authorization/compliance checks.
- Customer support drafts/knowledge base, knowledge search, meeting summaries, operations dashboards.
- Gmail/Outlook, Calendar, Drive, Slack, Notion, HubSpot, GitHub, Stripe, YouTube, Meta, Shopify, Twilio, and others via official approved integrations.

### D. Research & optimize
- Market research with attributable sources, SEO and analytics audits, competitor comparison, conversion-funnel diagnostics, financial models, experiment planning, recurring monitoring, transparent dashboards.

### E. User experience
- Cupi chat + voice interaction (optional), Mission Control, Agent Activity timeline, Skills Marketplace, Connected Apps permissions, Approvals Inbox, Credits Wallet, Notifications Center, Artifacts Library, Settings & Security.
- Real-time and asynchronous progress updates through in-app events; opt-in email/SMS/push for milestones, blockers, action requests and summaries.
- Pause/resume/stop, revise scope, budget limits, reassign team, download/export deliverables, version history, per-action logs.

## 3. One user goal → executable mission
1. User enters a short goal. Cupi asks only required questions.
2. Intake planner builds an outcome definition and a DAG of measurable milestones.
3. Skill router chooses *available* capabilities according to actual integrations and permissions.
4. Budget engine quotes estimated credits and any external costs; user approves budget.
5. Orchestrator creates agent tasks and runs independent branches concurrently.
6. Specialist agents call tools in scoped, sandboxed environments; durable execution survives interruptions.
7. Validator checks sources, tests code, previews media, detects hallucinations, and reviews policy/risk.
8. Approval gate waits before public posting, external contacts, spending, payment, production deployments, deletion, or materially consequential changes, unless the user has specifically preauthorized the action class, constraints, and limits.
9. Outputs and actions are logged, credits settled, and notifications sent.
10. Ongoing mission stays scheduled or pauses and resumes when data, budget, authorization, or user feedback arrives.

**Mission status model:** draft → estimated → awaiting authorization → queued → running → awaiting review → completed/partially completed/failed/paused/canceled. Steps hold retries and idempotency keys to avoid duplicate external actions.

## 4. Agent roles
| Agent | Responsibility | Standard tools |
|---|---|---|
| **Cupi** | Intake, explain plan, coordinate, update user | Mission API, approvals, notifications |
| **Scout** | Research, verify and cite sources | Web research, public datasets |
| **Nova** | Brand, writing, graphics, design systems | Content/image tools |
| **Forge** | Develop, test, deploy software | Sandbox shell, repo, CI, deploy on approval |
| **Motion** | Scripts, editing plans and media production | Render queue, media APIs, publishing connectors |
| **Echo** | Outreach and customer communication | CRM, mail-draft tool, scheduling |
| **Atlas** | Research-heavy documents, decks, spreadsheets | File processing and data analysis |
| **Pulse** | SEO, analytics, reporting, recurring workflows | Analytics, scheduler, dashboards |
| **Vale** | Independent quality and safety validation | Testing, policy and action-review tools |

Do **not** instantiate all agents for every task. Choose the cheapest team that has the skills the goal needs; single-agent execution is acceptable for simple tasks.

## 5. Skills registry
Each installable skill needs a manifest, a version, an owner, allowable tools, scope of credentials, privacy classification, estimated variable cost, run/timeout limits, tests, rollback path and applicable audit policy.

**Example skill groups:** website-builder, fullstack-app, page-accessibility-audit, SEO-audit, brand-identity, pitch-deck, academic-presentation, financial-model, spreadsheet-research, video-script, caption-generation, video-editing, content-scheduler, youtube-publisher, instagram-publisher, email-draft, crm-prospecting, calendar-scheduler, enterprise-lead-research, competitor-research, analytics-investigation, QA-runner, technical-support, customer-support-drafts.

Never offer arbitrary “unlimited capability” just because an agent has a prompt. Display *supported*, *needs connection*, *needs approval*, or *not available*.

## 6. Production architecture
**Suggested initial stack:**
- Frontend: Next.js / TypeScript, Tailwind, reusable design system; responsive web app first.
- Identity/data: Postgres (e.g., Supabase or managed PostgreSQL), tenant-scoped RBAC, object storage, encrypted secrets manager.
- Orchestrator: one orchestration service with structured step plans and tool-call policies; use an agent SDK/framework that supports tool calling, routing and tracing.
- Durable jobs: Temporal or Inngest, queues, retries, idempotent step execution, event logs. Choose based on team and hosting constraints.
- Sandboxed code and browser work: per-mission ephemeral containers with resource limits, network egress restrictions, secrets isolation and artifact scanning.
- Connected apps: provider OAuth with minimal verified scopes, token encryption, short-lived credentials where supported, official APIs before browser automation.
- Billing: Stripe subscriptions and a server-side append-only credit ledger with reserve/settle/refund/adjustments.
- Notifications: in-app realtime events; optional provider-based email, push, SMS, webhooks.
- Observability: logs, traces, usage/cost per agent/tool/run, errors, evaluations, abuse monitoring, admin audit tools.

**Required data model:** organizations, users, workspaces, memberships, missions, mission_steps, skill_manifests, agents, runs, tool_invocations, auth_connections, permissions, budgets, approvals, artifacts, schedules, notifications, credit_ledger, provider_costs, subscriptions, experiments, evaluation_results.

**Minimal service APIs:** POST /missions, POST /missions/:id/estimate, POST /missions/:id/authorize, POST /missions/:id/pause, POST /missions/:id/resume, GET /missions/:id/events, GET /missions/:id/artifacts, POST /approvals/:id/decision, GET /credits/ledger, POST /connections/:provider/start, DELETE /connections/:id. Authenticate and authorize every endpoint and webhook.

## 7. Permission and autonomy design
**Avoid blanket/unrestricted access to email, phones, payments or personal data.** It is difficult to secure, increases breach impact, and often violates API-platform principles. Use:
- OAuth/explicit connections with the narrowest scopes and clear permission previews.
- Tier 1: read/research/draft within user-selected sources and purposes.
- Tier 2: limited execution within approved policy, e.g. post **pre-reviewed** content to a specific channel at a specified cadence and daily credit cap.
- Tier 3: explicit approval for new external recipients, calling, purchasing, spending, public publishing, changing paid ads, production deployment and destructive operations.
- Safe limits: per-day outbound count, no unsolicited bulk spam, unsubscribes/opt-outs, clear AI disclosure where relevant, emergency stop and data deletion/revocation.
- No credential scraping, bypassing captchas, or exposing another user's secrets.
- Users can see access logs and revoke integrations immediately.

**YouTube integration note:** Uploads are possible via authenticated YouTube Data API. Apps must handle user consent, verification and quota; mass-produced daily videos must also comply with platform rules and content quality expectations. Instagram publishing has separate account/API eligibility requirements. Gmail scopes may require Google OAuth verification.

## 8. Example: “Make 10 Shorts a day for my YouTube channel”
- Ask for subject, target audience, brand voice, language, format, source assets/footage, quality level and channel authorization.
- Generate a 7-day topic bank and approval-ready quality rubric.
- Assemble Scout (sources/topics), Motion (scripts/rendering/captions), Vale (quality), Pulse (schedule/metrics).
- Estimate monthly production: 10/day × ~30 days = **~300 videos**, which may be very expensive for generative video. Present cost and feasibility before activation.
- Use official YouTube OAuth and publish API if permitted; require approval for new formats/voices/claims and allow narrowly defined auto-publishing after policy confirmation.
- Respect quota and upload restrictions. Avoid repetitive low-value output; build quality checks to improve retention and audience fit rather than promising channel growth.
- Report published/failed/awaiting-approval metrics and adjust based on retention, clicks and subscriptions.

## 9. Credit economics — proposed, not final
| Tier | Monthly | Illustrative credits | Concurrent missions | Intended user |
|---|---:|---:|---:|---|
| Explore | $0 | 100 one-time | Preview only | Try it |
| Launch | $29 | 1,000 | 1 | Solo starter |
| Builder | $89 | 4,000 | 3 | Active founder |
| Growth | $249 | 12,000 | 8 | Growing operation |
| Studio | $649 | 35,000 | 20 | Agency or team |

**Pricing cannot be safely finalized until unit economics are measured.** Define credit consumption based on observed AI tokens, media generation, compute seconds, search, browser automation and provider actions. Track realized variable cost `C` and realized revenue `R` per account and per workflow. Target healthy contribution margins after inference, rendering, retries, infrastructure and support; adjust rates or features if `C/R` is too high.

Illustrative consumption buckets **only** (not actual future prices): research memo 40–160 credits; presentation 80–450; landing-page design/development 500–2,000; one short-form video 150–800+ depending on generation; outreach planning 200–700. A user posting ~300 generated videos/month may need dedicated volume pricing/add-on and external media charges.

Credits should show **estimated upfront**, **reserved before work**, **settled from usage**, and **refunded for failed/unrun steps**. Add spend ceilings, account-level budgets, usage invoices, low-balance alerts, and optional top-ups. Ad spend, domains, telecom, paid APIs and transactional fees must be itemized rather than silently absorbed.

## 10. MVP scope (ship reliability before breadth)
**Pilot workflows:**
1. High-quality website from idea (brand + pages + preview + tests + human-approved deploy).
2. Professional presentation from idea (research with citations + editable deck + visual review).
3. Creator publishing copilot (channel connection, scripts/assets/scheduling, reviewed YouTube posts).
4. Optional early business track: B2B research and **drafted** outreach + CRM, with later sending permissions.

**Must-have infrastructure:** signup/login, Cupi intake, mission planner, specialist routing, 3–5 tested skills, durable job execution, progress events, artifact downloads, approvals, credit accounting and usage receipts, kill-switch, sandbox, basic analytics.

**Next wave:** additional integrations, full-stack apps, marketing optimization, email + calendar agents, call handling, continuous operations, team workspaces, marketplace, voice, vertical industry skill packs.

## 11. Phased delivery plan
**Phase 0 — research and validation:** 15+ customer discovery interviews across founders, creators, freelancers; demo usability test, brand/legal clearance, unit-cost benchmarks. Test if people will pay for outcomes not just chat.
**Phase 1 — foundation:** auth, tenant security, mission workflow, budget ledger, Cupi, activity feed and persistent state.
**Phase 2 — first real outcome:** website generator and slide generator with QA, exports and preview-only initial deployment.
**Phase 3 — connected automations:** YouTube/Google OAuth, review gates, scheduled posting, notifications, metering.
**Phase 4 — monetization:** Stripe billing, plan enforcement, credit packs, receipts, top-ups, abuse controls, operator dashboard.
**Phase 5 — expand:** CRM/sales, additional media connectors, enterprise features and higher volume.

**Acceptance checks:** 90%+ of pilot missions complete or clearly explain blockers, no unapproved external side effects, no negative credits, user can halt jobs, job state survives worker restarts, no cross-tenant data leakage, time-to-first-useful-artifact tracked, real gross margin monitored.

## 12. Brand design
- **Name:** Decupo (working name, requires trademark/domain clearance).
- **Mascot:** Cupi; ivory 3D robot with a midnight-violet face, coral chest spark, lavender antennae and rounded waving hands.
- **Voice:** optimistic, capable, warm; progress-oriented, transparent and never falsely confident.
- **Tagline:** “Say the dream. Watch it happen.”
- **Palette:** Midnight `#141329`, Coral `#FC805D`, Lavender `#8065ED`, Cream `#FFFAF4`, Mint `#BDE9D8`.
- **Product language:** Missions, Crew, Skills, Approvals, Credits, Deliverables, Updates.

## 13. Brand and legal checks
The name "Decupo" is **not legally cleared**. Check global domains, software/AI trademark classes, confusingly similar names, app-store names and social handles. The USPTO recommends a thorough search beyond one registry. Do not claim uniqueness or register a domain without validation and user approval.

## 14. Prototype included
`index.html` is an offline-capable, interactive front-end **concept**. It uses local `assets/cupi-mascot.png` and includes a responsive landing page, interactive example mission routing (rule-based mock), agent activity panel, pricing toggle and a permissions explanation. There is **no** back-end, account access, AI execution, content publishing or live billing.
