/**
 * Standalone worker process: `npm run worker`.
 * In local PGlite mode the web app runs the worker in-process instead
 * (see src/instrumentation.ts), because PGlite cannot be shared across processes.
 */
import { getDbHandle } from "./server/db/client";
import { newWorkerId, runForever } from "./server/worker/runner";

async function main() {
  if ((process.env.DATABASE_DRIVER ?? "pglite") !== "pg") {
    console.error("The standalone worker needs DATABASE_DRIVER=pg. With PGlite the web app runs the worker inline.");
    process.exit(1);
  }
  const { db } = await getDbHandle();
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  const workerId = newWorkerId();
  console.log(`[worker ${workerId}] started`);
  await runForever(db, { workerId, signal: controller.signal });
  console.log(`[worker ${workerId}] stopped`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
