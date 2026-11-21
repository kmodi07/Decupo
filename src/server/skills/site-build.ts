import { z } from "zod";
import type { Skill } from "./types";
import { brandNameFromGoal, generateSite, parseBrief, type SitemapEntry } from "./site/generate";

const sitemapSchema = z.object({ pages: z.array(z.object({ title: z.string(), path: z.string() })).min(1) });

/**
 * Forge turns the brand brief and sitemap into a complete static site.
 * Template-based (B-21): deterministic, no network, no code execution. The
 * sandboxed build step for user-authored code is still pending (B-22).
 */
export const siteBuild: Skill = {
  manifest: {
    id: "site-build",
    version: "0.1.0",
    name: "Build the website",
    description:
      "Generates a complete static site from the brand brief and sitemap: a page per sitemap entry, shared stylesheet, semantic responsive HTML, metadata and OpenGraph tags, and a contact form that is clearly marked as not connected. Template-based; no code is executed.",
    agent: "Forge",
    actionClass: "generate",
    permissionScopes: ["artifact:write", "artifact:read"],
    privacy: "user_content",
    cost: { baseCredits: 100, variableAllowanceCredits: 0, creditsPerThousandTokens: 0 },
    timeoutMs: 60_000,
    maxAttempts: 3,
    availability: "supported",
    inputSchema: z.record(z.string(), z.unknown()),
  },
  async run(ctx) {
    const outline = ctx.upstream["site-outline"];
    const parsed = sitemapSchema.safeParse(outline?.sitemap);
    let pages: SitemapEntry[];
    if (parsed.success) {
      pages = parsed.data.pages;
    } else if (typeof outline?.sitemapArtifactId === "string") {
      const art = await ctx.readArtifact(outline.sitemapArtifactId);
      const fromArtifact = art?.contentText ? sitemapSchema.safeParse(JSON.parse(art.contentText)) : null;
      if (!fromArtifact?.success) return { status: "blocked", reason: "The site outline step did not produce a usable sitemap." };
      pages = fromArtifact.data.pages;
    } else {
      return { status: "blocked", reason: "The site outline step has not run, so there is no sitemap to build from." };
    }

    const briefOut = ctx.upstream["brand-brief"];
    let brief = {};
    let offline = false;
    if (typeof briefOut?.artifactId === "string") {
      const art = await ctx.readArtifact(briefOut.artifactId);
      brief = parseBrief(art?.contentText ?? "");
    }
    if (briefOut?.mock === true || outline?.mock === true) offline = true;

    const brandName = typeof ctx.input.brandName === "string" && ctx.input.brandName.trim() ? ctx.input.brandName.trim() : brandNameFromGoal(ctx.goal);
    const files = generateSite({ brandName, goal: ctx.goal, pages, brief, offline, tagline: typeof ctx.input.tagline === "string" ? ctx.input.tagline : undefined });

    const artifactIds: string[] = [];
    const written: Array<{ path: string; artifactId: string; bytes: number }> = [];
    for (const f of files) {
      // One artifact per file; idempotent across retries through the step journal.
      const saved = await ctx.once(`file:${f.path}`, "artifact.write", async () => {
        const a = await ctx.writeArtifact({ kind: f.kind, title: f.path, path: f.path, content: f.content });
        return { artifactId: a.id, bytes: a.sizeBytes };
      });
      artifactIds.push(saved.artifactId);
      written.push({ path: f.path, ...saved });
    }
    await ctx.log(`Generated ${files.length} files for ${pages.length} pages.`, { files: written.map((w) => w.path) });

    return {
      status: "succeeded",
      output: {
        artifactIds,
        files: written,
        entry: "index.html",
        pageCount: pages.length,
        brandName,
        generator: "template",
        mock: offline,
      },
      summary: offline
        ? `Static site generated: ${pages.length} pages, ${files.length} files. Copy is an offline draft from templates.`
        : `Static site generated: ${pages.length} pages, ${files.length} files.`,
    };
  },
};
