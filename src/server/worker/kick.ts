import type { Db } from "../db/client";
import { afterResponse, cloudflareContext } from "../cloudflare";
import { drain } from "./runner";

/**
 * Nudge the step runner after something was enqueued.
 *
 * Locally the inline worker (PGlite) or the standalone worker (pg) is already
 * polling, so this is a no-op. On Cloudflare Workers there is no long-running
 * process: the request that enqueued work drains the queue after its response
 * is sent, and a one-minute cron trigger picks up anything left over or retried.
 */
export async function kickWorker(db: Db): Promise<void> {
  if (!(await cloudflareContext())) return;
  await afterResponse(() => drain(db, { workerId: "request", maxJobs: 25 }));
}
