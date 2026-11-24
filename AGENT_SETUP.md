# Decupo — Real Multi-Agent Build Setup

This is **real coding-agent execution infrastructure**, not an animated mockup. It remains **unconfigured / unrun** until the owner adds the API key and starts a run.

## What is installed
- `.claude/agents/frontend.md`: writes actual website files under `site/`.
- `.claude/agents/backend.md`: writes actual mission API under `server/`.
- `.claude/agents/qa.md`: writes executable acceptance tests under `tests/`.
- `scripts/run_swarm.py`: launches three separate Claude Code CLI processes **concurrently** in isolated Git worktrees. Tracks actual tool invocations and results, cherry-picks each worker's scoped commit, and generates a factual HTML run report and JSON event log.
- `.github/workflows/real-agent-swarm.yml`: manual run in GitHub Actions; uploads artifact `agent-reports/`; proposes the code via a draft pull request. No deploys.

## How to start
1. Review and merge the setup pull request to `main` so the manually triggered workflow is available.
2. GitHub → repository **Settings → Secrets and variables → Actions → New repository secret**, add `ANTHROPIC_API_KEY` securely. Never paste your key into a chat or code file.
3. GitHub → repository **Actions** → **Decupo • Real AI Agent Swarm** → **Run workflow**.
4. Enter your goal, e.g. `Build Decupo's landing pages, mission API and testing harness`, select a max-turn cap (start at 8), and run.
5. Watch each agent's real console messages in the workflow. Download its `decupo-agent-evidence-...` artifact for a static HTML activity report, per-agent logs and commit evidence.
6. Review the draft pull request created by the workflow. Do not merge before checking the generated code, tests, permissions and design.

## Important limitations
- Three independent Claude Code processes run *in parallel*; this does not create three mouse cursors or live graphical remote desktops.
- GitHub Actions shows genuine concurrent CLI events and code commits; the HTML report is a completed-run snapshot.
- `ANTHROPIC_API_KEY` API usage is metered by Anthropic separately from a Claude chat subscription.
- Workflow runners are ephemeral and can incur model usage, GitHub Actions minutes and artifact storage.
- The generated website is NOT automatically deployed to decupo.com. Existing website service and data must be preserved.
- Real user missions, payment credits, OAuth, publishing and push notifications require further engineering.
- For safe production use, pin third-party GitHub Actions and CLI dependencies to verified versions or immutable revisions before launch.
- If GitHub Actions cannot create a pull request, review repository Actions settings for workflow pull-request permissions. A failed run does not prove workers completed.

## CEO build priorities
1. Verify running agents generate actual working website + backend + automated tests.
2. Build real Mission Control status visualization from server-side events, never simulated activity.
3. Add tenant-aware mission persistence, worker queue, approvals, budgets and OAuth.
4. Pilot premium website missions and price using observed completion cost.
5. Deploy to staging and perform visual/browser QA before any decupo.com cutover.
