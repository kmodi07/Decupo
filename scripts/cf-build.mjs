#!/usr/bin/env node
/**
 * Build the Cloudflare Worker bundle on any OS.
 *
 * Next.js 16 writes `.next/standalone/.next/node_modules/<pkg>-<hash>` as
 * symlinks to the real packages. OpenNext recreates those links with
 * `fs.symlinkSync`, which Windows refuses without developer mode. This script
 * runs `next build`, replaces each of those links with a real copy, then runs
 * the OpenNext build with the Next.js step skipped.
 */
import { execSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, readdirSync, readlinkSync, rmSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const run = (cmd, env = {}) => execSync(cmd, { stdio: "inherit", shell: true, env: { ...process.env, ...env } });

// Same switch OpenNext flips: produce the standalone output without changing next.config.
run("npx next build", { NEXT_PRIVATE_STANDALONE: "true" });

const linkDir = path.join(root, ".next", "standalone", ".next", "node_modules");
let replaced = 0;
if (existsSync(linkDir)) {
  for (const name of readdirSync(linkDir)) {
    const p = path.join(linkDir, name);
    if (!lstatSync(p).isSymbolicLink()) continue;
    const target = path.resolve(path.dirname(p), readlinkSync(p));
    rmSync(p, { recursive: true, force: true });
    cpSync(target, p, { recursive: true, dereference: true });
    replaced += 1;
  }
}
console.log(`[cf-build] dereferenced ${replaced} standalone symlink(s)`);

run("npx opennextjs-cloudflare build --skipNextBuild");

// Next copies local .env files into the standalone output and loads them at
// runtime. Production configuration comes from wrangler vars and secrets only,
// so strip the local .env files from the bundle.
const fnDir = path.join(root, ".open-next", "server-functions", "default");
let stripped = 0;
if (existsSync(fnDir)) {
  for (const name of readdirSync(fnDir)) {
    if (/^.env(..+)?$/.test(name)) {
      rmSync(path.join(fnDir, name), { force: true });
      stripped += 1;
    }
  }
}
console.log(`[cf-build] stripped ${stripped} local .env file(s) from the bundle`);
