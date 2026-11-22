# Language model providers

Decupo's skills reach a language model through one seam, `src/server/llm/`.
Production has run with `LLM_PROVIDER=mock` since launch: every skill
composes its deliverable deterministically from the goal and the answers, and
no model is called. This document is how to switch that on.

## What changes when a real provider is configured

- The planner offers the `general-task` skill (agent Atlas) for goals that no
  template recognises, instead of the structured research memo. Its artifact
  is headed **Model-written draft, not verified** and names the provider and
  model that wrote it. The `qa-review` step flags every model-written artifact
  as unverified, and separately flags a draft the model cut short or declined.
- The deterministic skills (brand brief, research memo, site build, sales and
  growth plans, reel plans) do not change. They never call a model.
- Each model call records input and output tokens in `provider_costs`
  (`sku` = `<provider>/<model>/input|output`) and the step settles
  `baseCredits + tokens/1000 * creditsPerThousandTokens` against the mission's
  reservation, as every other skill does.
- The system prompt tells the model to write English only, to use only the
  facts the user gave, to mark gaps as `[to confirm: ...]`, and never to invent
  figures, names or sources. Nothing in a model-written draft is presented as
  verified fact.

## Providers

| `LLM_PROVIDER` | SDK | Default model | Key | Model override |
|---|---|---|---|---|
| `mock` (default) | none | `mock-<tier>` | none | none |
| `anthropic` | `@anthropic-ai/sdk` | `claude-opus-5-5`, adaptive thinking, effort by tier | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` |
| `openai` | `openai` | `gpt-5.1` (Chat Completions) | `OPENAI_API_KEY` | `OPENAI_MODEL` |
| `xai` | `openai` pointed at `https://api.x.ai/v1` | `grok-4` | `XAI_API_KEY` | `XAI_MODEL`, `XAI_BASE_URL` |
| `router` | all of the above that have a key | per provider | at least one of the three keys | `LLM_ROUTER_PROVIDERS`, `LLM_ROUTER_STRATEGY` |

A provider whose key is missing refuses to start with a message that names the
variable and where to create the key. Requests with a large output cap are
streamed so a long document does not idle until the HTTP timeout. Every
response carries the provider, the model and a stop reason.

### Which keys to create

A ChatGPT or Grok subscription does not include API access; each platform
issues a separate key, billed per token.

| Provider | Where | Notes |
|---|---|---|
| Anthropic | platform.claude.com, API keys | Add credit before the first call. |
| OpenAI | platform.openai.com/api-keys | A platform (API) key, not the ChatGPT account. Set a monthly budget in the platform settings. |
| xAI | console.x.ai, API keys | Separate from the Grok consumer subscription. |

### The router

`LLM_PROVIDER=router` spreads calls across every configured provider:

- **Rotation:** `LLM_ROUTER_STRATEGY=round-robin` (default) starts each call
  one provider further along; `least-recently-used` starts with the provider
  idle the longest.
- **Failover:** on a 429, a 5xx or a network failure the call moves to the
  next provider in order. A provider that just failed that way is skipped for
  30 seconds unless every provider is cooling down. A 400, a 401 or a refusal
  stops the chain at once, because trying another provider would hide a
  configuration mistake.
- **Which provider answered:** every response's `provider` and `model` are the
  provider that actually wrote the text, and `route.attempts` lists each
  attempt with its status. The `general-task` step logs this on the mission
  (`step.log`, "Model call served by ...") and stores it in the step output.
- `LLM_ROUTER_PROVIDERS=anthropic,openai` narrows the pool and sets the
  order; providers named there without a key are left out.

If the router is selected and no key is set, the process reports a clear
error from `GET /api/health` (`llm.error`) and every model-backed step fails
with the same message; the deterministic skills keep working.

## Setting the secrets

On the Worker (names are exact; one command per key, paste the key when
prompted, no trailing newline):

```powershell
npx wrangler secret put ANTHROPIC_API_KEY
```

```powershell
npx wrangler secret put OPENAI_API_KEY
```

```powershell
npx wrangler secret put XAI_API_KEY
```

Locally, in the git-ignored `.dev.vars` (read by `wrangler dev`) and, for
`next dev`, in `.env.local`:

```
LLM_PROVIDER=router
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
XAI_API_KEY=xai-...
# optional
# LLM_ROUTER_STRATEGY=round-robin
# LLM_ROUTER_PROVIDERS=anthropic,openai,xai
# ANTHROPIC_MODEL=claude-opus-5-5
# OPENAI_MODEL=gpt-5.1
# XAI_MODEL=grok-4
```

## Switching `LLM_PROVIDER`

`LLM_PROVIDER` is a plain var in `wrangler.jsonc` (`"LLM_PROVIDER": "mock"`
today). To switch production:

1. Put the secrets above on the Worker.
2. Change the var in `wrangler.jsonc` to `router` (or one provider's name).
3. `npm run cf:build` and `npx wrangler deploy`.
4. `GET /api/health` shows `llm: { provider: "router", mock: false, providers: [...] }`.
   An `error` field there means a key or the provider name is wrong; fix it
   before creating missions, since model-backed steps will fail until then.

To go back, set the var to `mock` and redeploy. Missions already planned with
a `general-task` step will then report that step as blocked, uncharged.

## Tests

The suite never calls the network. `tests/llm.test.ts` exercises the router
with fake providers (rotation, failover, usage and route metadata), the
missing-key errors, and a full `general-task` mission against a fake provider
installed with `setLlmProviderForTests`. `LLM_PROVIDER` is unset in
`vitest.config.ts`, so every other test runs on the mock.
