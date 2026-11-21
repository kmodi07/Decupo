import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { runMigrations } from "./migrate";
import { cloudflareContext } from "../cloudflare";

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
  // Imported through a variable so output tracing never bundles PGlite (and its
  // WASM) into the Cloudflare Worker, where only the pg driver is used.
  const pgliteModule = "@electric-sql/pglite";
  const drizzlePgliteModule = "drizzle-orm/pglite";
  const { PGlite } = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ pgliteModule)) as typeof import("@electric-sql/pglite");
  const { drizzle } = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ drizzlePgliteModule)) as typeof import("drizzle-orm/pglite");
  if (dataDir) {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dataDir, { recursive: true });
  }
  const client = dataDir ? new PGlite(dataDir) : new PGlite(); // undefined => in-memory
  await client.waitReady;
  const db = drizzle(client, { schema }) as unknown as Db;
  return { db, driver: "pglite", close: () => client.close() };
}

async function createPgHandle(url: string, max: number): Promise<DbHandle> {
  // Variable imports keep pg out of the bundler's sight: Next would otherwise
  // externalise it as a hashed module the Cloudflare bundle cannot load.
  const pgModule = "pg";
  const drizzlePgModule = "drizzle-orm/node-postgres"; // imports pg itself
  const { Pool } = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ pgModule)) as typeof import("pg");
  const { drizzle } = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ drizzlePgModule)) as typeof import("drizzle-orm/node-postgres");
  const pool = new Pool({ connectionString: url, max });
  const db = drizzle(pool, { schema }) as unknown as Db;
  return { db, driver: "pg", close: () => pool.end() };
}

/** Cloudflare Workers: Neon's serverless driver speaks Postgres over WebSocket, so no socket API is needed. */
async function createNeonHandle(url: string, max: number): Promise<DbHandle> {
  const { Pool } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-serverless");
  const pool = new Pool({ connectionString: url, max });
  const db = drizzle(pool, { schema }) as unknown as Db;
  return { db, driver: "pg", close: () => pool.end() };
}

export type CreateDbOptions = {
  driver?: "pg" | "pglite" | "neon";
  url?: string;
  pgliteDataDir?: string | null; // null => in-memory
  migrate?: boolean;
  /** Pool size for the pg driver. */
  poolSize?: number;
};

/** Create a fresh handle. Used by tests and by the singleton below. */
export async function createDb(opts: CreateDbOptions = {}): Promise<DbHandle> {
  const envDriver = process.env.DATABASE_DRIVER;
  const driver = opts.driver ?? (envDriver === "pg" || envDriver === "neon" ? envDriver : "pglite");
  let handle: DbHandle;
  if (driver === "pg" || driver === "neon") {
    const url = opts.url ?? process.env.DATABASE_URL;
    if (!url) throw new Error(`DATABASE_URL is required when DATABASE_DRIVER=${driver}`);
    handle = driver === "neon" ? await createNeonHandle(url, opts.poolSize ?? 2) : await createPgHandle(url, opts.poolSize ?? 10);
  } else {
    const dir = opts.pgliteDataDir === undefined ? (process.env.PGLITE_DATA_DIR ?? "./data/pglite") : opts.pgliteDataDir;
    handle = await createPgliteHandle(dir ?? undefined);
  }
  if (opts.migrate ?? true) await runMigrations(handle);
  return handle;
}

// Process-wide singleton (survives Next.js dev HMR via globalThis).
const g = globalThis as unknown as { __decupoDb?: Promise<DbHandle> };

/**
 * On Cloudflare Workers a connection cannot be shared between requests, and
 * the migration files are not on disk, so each request gets its own small
 * Neon pool from the DATABASE_URL secret and migrations run from the CLI.
 */
const perRequest = new WeakMap<object, Promise<DbHandle>>();

export async function getDbHandle(): Promise<DbHandle> {
  const cf = await cloudflareContext();
  if (cf) {
    const key = cf.ctx;
    let p = perRequest.get(key);
    if (!p) {
      const url = (cf.env.DATABASE_URL as string | undefined) ?? process.env.DATABASE_URL;
      if (!url) throw new Error("No DATABASE_URL secret is configured for this Worker");
      p = createDb({ driver: "neon", url: url.trim(), migrate: false, poolSize: 2 });
      perRequest.set(key, p);
      // Not closed explicitly: streaming responses and waitUntil work may still be
      // using it after the handler returns; the runtime drops the WebSocket
      // connections when the request's work ends.
    }
    return p;
  }
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
