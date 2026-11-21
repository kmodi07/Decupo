import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { runMigrations } from "./migrate";

/**
 * A database handle (or a transaction handle) bound to the Decupo schema.
 * Both the node-postgres and PGlite drivers satisfy this type, as do their
 * transaction objects, so services can be written once.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export type DbHandle = {
  db: Db;
  close: () => Promise<void>;
  driver: "pg" | "pglite";
};

async function createPgliteHandle(dataDir: string | undefined): Promise<DbHandle> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  if (dataDir) {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dataDir, { recursive: true });
  }
  const client = dataDir ? new PGlite(dataDir) : new PGlite(); // undefined => in-memory
  await client.waitReady;
  const db = drizzle(client, { schema }) as unknown as Db;
  return { db, driver: "pglite", close: () => client.close() };
}

async function createPgHandle(url: string): Promise<DbHandle> {
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const pool = new Pool({ connectionString: url, max: 10 });
  const db = drizzle(pool, { schema }) as unknown as Db;
  return { db, driver: "pg", close: () => pool.end() };
}

export type CreateDbOptions = {
  driver?: "pg" | "pglite";
  url?: string;
  pgliteDataDir?: string | null; // null => in-memory
  migrate?: boolean;
};

/** Create a fresh handle. Used by tests and by the singleton below. */
export async function createDb(opts: CreateDbOptions = {}): Promise<DbHandle> {
  const driver = opts.driver ?? (process.env.DATABASE_DRIVER === "pg" ? "pg" : "pglite");
  let handle: DbHandle;
  if (driver === "pg") {
    const url = opts.url ?? process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is required when DATABASE_DRIVER=pg");
    handle = await createPgHandle(url);
  } else {
    const dir = opts.pgliteDataDir === undefined ? (process.env.PGLITE_DATA_DIR ?? "./data/pglite") : opts.pgliteDataDir;
    handle = await createPgliteHandle(dir ?? undefined);
  }
  if (opts.migrate ?? true) await runMigrations(handle);
  return handle;
}

// Process-wide singleton (survives Next.js dev HMR via globalThis).
const g = globalThis as unknown as { __decupoDb?: Promise<DbHandle> };

export function getDbHandle(): Promise<DbHandle> {
  if (!g.__decupoDb) g.__decupoDb = createDb();
  return g.__decupoDb;
}

export async function getDb(): Promise<Db> {
  return (await getDbHandle()).db;
}

/** Tests inject their own handle so routes/services use the test database. */
export function setDbHandleForTests(handle: DbHandle | undefined) {
  g.__decupoDb = handle ? Promise.resolve(handle) : undefined;
}

export { schema };
