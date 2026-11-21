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
