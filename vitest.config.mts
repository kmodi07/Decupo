import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Each file boots its own in-memory PGlite; isolate files in forks.
    pool: "forks",
    env: {
      DATABASE_DRIVER: "pglite",
      SESSION_SECRET: "test-session-secret-not-for-production",
      SECRETS_MASTER_KEY: "0000000000000000000000000000000000000000000000000000000000000000",
      APP_ORIGIN: "http://localhost:3000",
      WORKER_INLINE: "false",
    },
  },
});
