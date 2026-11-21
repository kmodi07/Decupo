# Repository audit — 2026-11-21

## What was actually in the folder
| Path | Status |
|---|---|
| `CLAUDE_CODE_BUILD_PROMPT.md` | Present. Build brief. |
| `PRODUCT_BLUEPRINT.md` | Present. Product blueprint v0.1. |
| `Glossy Floating Robot Mascot.png` | Present. 1254×1254 RGBA PNG, 1.1 MB. This is the Cupi mascot. |
| `README.md` | **Missing** (referenced by the build prompt). |
| `index.html` | **Missing** (referenced as the design prototype). |
| `assets/cupi-mascot.png` | **Missing**. The mascot exists only under the long filename above; it has been copied to `public/assets/cupi-mascot.png` (original kept). |
| Git history | **None**. Repository initialised on `main` during this audit. |

Consequence: there was no working system to preserve and no prototype markup to
evolve. The visual identity is rebuilt from the blueprint's brand section
(palette, voice, product language) and the mascot image.

## Environment
| Tool | Result |
|---|---|
| Node.js | v24.13.0 |
| npm | 11.6.2 (no pnpm) |
| git | 2.53.0 |
| Docker | not installed |
| PostgreSQL client/server | not installed |
| Python | 3.14.2 (unused) |

Consequence: local development and the automated test suite cannot assume a
Postgres server. The app uses **PGlite** (Postgres compiled to WASM, runs
in-process) for tests and local dev, and the identical Drizzle schema and SQL
migrations against managed PostgreSQL in production. Row-level-security
policies are shipped in the migrations but are only *exercised* against a real
Postgres role; see `RISK_REGISTER.md` R-04.

## Name, domain and vendor assumptions (validation status)
Nothing below has been verified by this audit; none of it is asserted in product copy.
- **"Decupo" trademark / domain**: not cleared. The project owner owns `decupo.com` (Cloudflare DNS, linked to Paddle); it currently serves their Portuguese audio-transcription service, so the cutover is a migration (see `DECISIONS.md`). Trademark classes are otherwise not checked. Blocked on a human-run clearance
  search (USPTO/EUIPO/WIPO, domain registrars, app stores, social handles). The
  app calls itself "Decupo (working name)" in the footer until cleared.
- **Anthropic API** for planning and writing agents: no key present. The code
  ships an offline mock provider and an adapter that activates when
  `ANTHROPIC_API_KEY` is set. Model pricing is **not** hard-coded as fact; the
  cost model reads a config table the operator fills from the provider's price list.
- **YouTube Data API / Google OAuth**: requires a Google Cloud project, OAuth
  consent screen, app verification for sensitive scopes, and quota (default
  10,000 units/day; an upload costs about 1,600 units). Not started. Phase 5.
- **Stripe**: no account connected. Phase 6.
- **Temporal / Inngest**: not adopted in Phase 1. A Postgres-backed job table
  with leases, retries and idempotency keys gives durable execution without a
  second service; the runner is isolated behind one interface so it can be
  swapped if volume demands it.

## Dependencies introduced (Phase 1)
Runtime: `next`, `react`, `react-dom`, `drizzle-orm`, `pg`, `@electric-sql/pglite`, `zod`.
Dev: `typescript`, `vitest`, `drizzle-kit`, `tsx`, `tailwindcss`, `@tailwindcss/postcss`, `eslint`, `eslint-config-next`, type packages.
No native build steps: password hashing uses Node's built-in `scrypt`; secret
encryption uses Node's built-in AES-256-GCM.
