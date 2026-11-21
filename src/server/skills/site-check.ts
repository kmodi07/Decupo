import { z } from "zod";
import type { Skill } from "./types";
import { checkSite, renderReport } from "./site/check";
import type { SiteFile } from "./site/generate";

/**
 * Vale runs deterministic checks over the generated site files. Nothing is
 * rendered or executed and no network is used; a failing check always yields
 * the verdict `needs_work` and is listed in the report.
 */
export const siteCheck: Skill = {
  manifest: {
    id: "site-check",
    version: "0.1.0",
    name: "Check the website",
    description:
      "Offline quality checks over the generated site: internal links resolve, every image has alt text, exactly one h1 per page, lang attribute, non-empty title, viewport meta. Failures are reported, never hidden.",
    agent: "Vale",
    actionClass: "read",
    permissionScopes: ["artifact:read", "artifact:write"],
    privacy: "internal",
    cost: { baseCredits: 25, variableAllowanceCredits: 0, creditsPerThousandTokens: 0 },
    timeoutMs: 30_000,
    maxAttempts: 2,
    availability: "supported",
    inputSchema: z.record(z.string(), z.unknown()),
  },
  async run(ctx) {
    const build = ctx.upstream["site-build"];
    const ids = z.array(z.string()).safeParse(build?.artifactIds);
    if (!ids.success || ids.data.length === 0) {
      return { status: "blocked", reason: "The site build step did not produce any files to check." };
    }
    const files: SiteFile[] = [];
    for (const id of ids.data) {
      const a = await ctx.readArtifact(id);
      if (!a || !a.path || a.contentText === null) continue;
      files.push({ path: a.path, kind: a.kind === "css" ? "css" : "html", content: a.contentText });
    }
    if (files.length !== ids.data.length) {
      return { status: "blocked", reason: `Only ${files.length} of ${ids.data.length} generated files could be read.` };
    }

    const report = checkSite(files, { offlineCopy: build?.mock === true });
    const artifact = await ctx.writeArtifact({ kind: "markdown", title: "Site quality review", content: renderReport(report) });
    const errors = report.findings.filter((f) => f.severity === "error");
    const warnings = report.findings.filter((f) => f.severity === "warning");
    return {
      status: "succeeded",
      output: {
        artifactId: artifact.id,
        verdict: report.verdict,
        pagesChecked: report.pagesChecked,
        linksChecked: report.linksChecked,
        findings: errors.map((f) => `${f.file}: ${f.message}`),
        warnings: warnings.map((f) => `${f.file}: ${f.message}`),
      },
      summary: `Site check: ${report.verdict} (${report.pagesChecked} pages, ${errors.length} failures, ${warnings.length} notes).`,
    };
  },
};
