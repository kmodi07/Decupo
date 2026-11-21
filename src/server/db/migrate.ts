import path from "node:path";
import type { DbHandle } from "./client";

const migrationsFolder = path.resolve(process.cwd(), "drizzle");

/** Apply all SQL migrations in ./drizzle with the driver-specific migrator. */
export async function runMigrations(handle: Pick<DbHandle, "db" | "driver">): Promise<void> {
  if (handle.driver === "pglite") {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await migrate(handle.db as any, { migrationsFolder });
  } else {
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await migrate(handle.db as any, { migrationsFolder });
  }
}
