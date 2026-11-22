import { json, readJson, withAuth } from "@/server/http";
import { connectWithApiKey, startOAuth } from "@/server/connections/service";
import { getProvider, isProviderId } from "@/server/connections/providers";
import { NotFoundError } from "@/server/errors";

/**
 * Start connecting a provider. API-key providers take `{ apiKey, label? }` and
 * return the new connection; OAuth providers return `{ authorizeUrl }` for the
 * browser to follow (the callback route finishes the flow).
 */
export const POST = withAuth<{ provider: string }>(async (req, { db, ctx }, { provider }) => {
  if (!isProviderId(provider)) throw new NotFoundError("Provider");
  if (getProvider(provider).authKind === "oauth") {
    return json(await startOAuth(db, ctx, provider));
  }
  const connection = await connectWithApiKey(db, ctx, provider, await readJson(req));
  return json({ connection }, { status: 201 });
});
