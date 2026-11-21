/**
 * Thin seam between the app and the Cloudflare Workers runtime (OpenNext).
 *
 * Everything here degrades to "not on Cloudflare" in `next dev`, the
 * standalone Node worker and vitest, so the rest of the server code never
 * imports `@opennextjs/cloudflare` directly.
 */

export type CloudflareEnv = {
  DATABASE_URL?: string;
  [key: string]: unknown;
};

export type CloudflareContext = {
  env: CloudflareEnv;
  ctx: { waitUntil(p: Promise<unknown>): void };
};

type Loader = () => Promise<{ getCloudflareContext: (o?: { async: true }) => Promise<CloudflareContext> }>;
// Hidden from bundler static analysis so local builds never pull the adapter in by accident.
const adapterModule = "@opennextjs/cloudflare";
const loadAdapter: Loader = () => import(/* webpackIgnore: true */ adapterModule) as ReturnType<Loader>;

/** The Cloudflare request context, or null when not running on Workers. */
export async function cloudflareContext(): Promise<CloudflareContext | null> {
  if (!process.env.CLOUDFLARE_WORKER) return null;
  try {
    const mod = await loadAdapter();
    return await mod.getCloudflareContext({ async: true });
  } catch {
    return null;
  }
}

/** Run `work` after the response has been sent when on Workers; otherwise run it detached. */
export async function afterResponse(work: () => Promise<unknown>): Promise<void> {
  const cf = await cloudflareContext();
  if (cf) {
    cf.ctx.waitUntil(work().catch((err) => console.error("[afterResponse]", err)));
    return;
  }
  void work().catch((err) => console.error("[afterResponse]", err));
}
