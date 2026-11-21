/**
 * Next.js instrumentation hook. In PGlite mode (local development) the worker
 * runs inside the web process, because an embedded PGlite database cannot be
 * opened by two processes at once. With DATABASE_DRIVER=pg, run `npm run worker`
 * separately and set WORKER_INLINE=false.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const inline = process.env.WORKER_INLINE ?? ((process.env.DATABASE_DRIVER ?? "pglite") === "pglite" ? "true" : "false");
  if (inline !== "true") return;
  const g = globalThis as { __decupoWorker?: boolean };
  if (g.__decupoWorker) return;
  g.__decupoWorker = true;
  const { getDbHandle } = await import("./server/db/client");
  const { runForever, newWorkerId } = await import("./server/worker/runner");
  const { db } = await getDbHandle();
  const workerId = newWorkerId();
  console.log(`[decupo] inline worker ${workerId} started`);
  void runForever(db, { workerId });
}
