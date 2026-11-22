# Deploying Decupo to Cloudflare Workers

Decupo runs on Cloudflare Workers through the OpenNext adapter, with Postgres
on Neon. This is the pre-cutover deployment: it lives on a `workers.dev`
address and never touches `decupo.com`, which still serves the transcreve
Worker (see `RUNBOOK_DECUPO_COM_CUTOVER.md`).

## Shape

| Piece | Where | Notes |
|---|---|---|
| Web app + API | Worker `decupo-app` | `.open-next/worker.js` wrapped by `worker.ts` |
| Database | Neon project `decupo`, branch `production` | Reached with `@neondatabase/serverless` over WebSocket; no Hyperdrive, no sockets API |
| Step runner | `kickWorker()` after enqueueing responses + cron `* * * * *` | Leases make the two safe together; no long-running process |
| Static assets | Workers Assets binding `ASSETS` | `.open-next/assets` |
| Secrets | `DATABASE_URL`, `SESSION_SECRET`, `SECRETS_MASTER_KEY`; model keys `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `XAI_API_KEY` when `LLM_PROVIDER` is not `mock` | `wrangler secret put`; see `LLM_PROVIDERS.md` |
| Vars | `wrangler.jsonc` | `APP_ORIGIN` must equal the public URL or every POST fails the origin check |

Local development is unchanged: PGlite with the inline worker. The driver is
chosen by `DATABASE_DRIVER`: `pglite` (default), `pg` (Node server with a
Postgres URL), `neon` (Workers).

## Build on Windows

`npm run cf:build` runs `scripts/cf-build.mjs`: `next build` with standalone
output, then it replaces the hashed symlinks Next 16 writes under
`.next/standalone/.next/node_modules` with real copies (Windows refuses the
symlinks OpenNext would create), then `opennextjs-cloudflare build
--skipNextBuild`. `pg` and PGlite are imported through variables in
`src/server/db/client.ts` so neither the bundler nor output tracing pulls them
into the Worker; the Worker bundle is about 12 MB raw, 2.5 MB gzipped.

## First deployment (already done)

```powershell
npx wrangler login
npm run cf:build
npx wrangler deploy                       # creates decupo-app on workers.dev
npx wrangler secret put DATABASE_URL      # Neon connection string, no trailing newline
npx wrangler secret put SESSION_SECRET    # 32 random bytes, hex
npx wrangler secret put SECRETS_MASTER_KEY
```

Migrations run from a machine with the connection string, not from the Worker:

```powershell
$env:DATABASE_DRIVER = "pg"; $env:DATABASE_URL = "<neon url>"; npm run db:migrate
```

The connection string is kept out of the repository and out of chat: put it in
the git-ignored `.dev.vars` as `DATABASE_URL=...` and read it from there.

## Every later deployment

```powershell
npm run cf:build
npx wrangler deploy
```

Run `npm run db:migrate` first whenever `drizzle/` gained a migration.

## Checks after a deploy

- `GET /api/health` returns `{"ok":true,...}` with `driver: "pg"` and job counts.
- Sign up, create a website mission, authorise it: steps complete within a
  minute (request kick) or on the next cron tick; the preview route serves the
  generated site.
- `wrangler tail decupo-app` shows no exceptions.

## Known limits

- Free Workers plan CPU limits may cut long steps; the deterministic skills
  are cheap, a connected model provider (`LLM_PROVIDERS.md`) will need the
  paid plan since a model call can run for minutes.
- No incremental cache is configured; every page renders per request.
- `wrangler deploy` is run from this machine; a GitHub Actions deploy needs a
  `CLOUDFLARE_API_TOKEN` secret and is not set up yet.
