# Decupo engineering operating instructions

Decupo is a mission-driven AI business-building platform. The core promise is: describe a goal; agents plan, execute, verify, and show real progress. Our mascot is Cupi.

## Core product
- A beautiful, accessible, responsive site with ivory, deep violet, and coral branding.
- Missions: goal intake, plan, budget, tasks, actual agent activity, real deliverables, approvals, and notifications.
- First wedge: premium website creation and editable presentation generation.
- Credits reflect measurable provider costs; do not invent balances or outcomes.
- A visible **live** Mission Control must distinguish queued, active, completed, failed and waiting-for-approval.

## Engineering guardrails
- Do not deploy to decupo.com, change DNS, or change existing customer services.
- No bulk outbound emails, social publishing, purchases, payment charges, or handling private credentials without explicit, granular authorization.
- No fabricated testimonials, sample telemetry represented as real, or claimed background jobs that never ran.
- No unsafe execution of arbitrary third-party code or browsing credentials.
- Tests and accessibility (including reduced-motion behavior) are release gates.
- Specialized agents own disjoint directories, not the same files.
- Prefer production-quality files over planning-only output.
- Each agent must give test evidence and limitations.

## Agent roles
See `.claude/agents/`. The GitHub workflow launches independently running CLI processes in isolated git worktrees, and proposes results via pull request. It is not live until `ANTHROPIC_API_KEY` is configured and the workflow is run.
