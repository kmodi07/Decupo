/**
 * Deterministic, offline checks over a generated static site (backlog B-21).
 *
 * Pure functions over the file tree: no network, no browser, no script
 * execution. Regex-based on purpose so the checker has no dependencies and
 * cannot be influenced by anything the pages would do when rendered.
 */
import type { SiteFile } from "./generate";

export type Severity = "error" | "warning";

export type Finding = {
  check: "link" | "img-alt" | "h1" | "lang" | "title" | "viewport" | "copy";
  severity: Severity;
  file: string;
  message: string;
};

export type CheckReport = {
  verdict: "pass" | "needs_work";
  pagesChecked: number;
  linksChecked: number;
  findings: Finding[];
};

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

export function checkSite(files: SiteFile[], opts: { offlineCopy?: boolean } = {}): CheckReport {
  const findings: Finding[] = [];
  const paths = new Set(files.map((f) => normalisePath(f.path)));
  const pages = files.filter((f) => f.kind === "html" || /\.html?$/i.test(f.path));
  let linksChecked = 0;

  for (const page of pages) {
    const html = stripComments(page.content);
    const file = page.path;

    // lang attribute on <html>
    const htmlTag = /<html\b[^>]*>/i.exec(html)?.[0];
    if (!htmlTag || !/\slang\s*=\s*["']?[a-z]{2,3}(?:-[a-z0-9]+)*["']?/i.test(htmlTag)) {
      findings.push({ check: "lang", severity: "error", file, message: "Missing lang attribute on <html>." });
    }

    // non-empty <title>
    const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    if (!title) findings.push({ check: "title", severity: "error", file, message: "Missing <title>." });
    else if (!title[1]!.trim()) findings.push({ check: "title", severity: "error", file, message: "Empty <title>." });

    // exactly one <h1>
    const h1s = html.match(/<h1\b[^>]*>/gi)?.length ?? 0;
    if (h1s !== 1) findings.push({ check: "h1", severity: "error", file, message: `Expected exactly one <h1>, found ${h1s}.` });

    // every <img> has alt
    for (const img of html.match(/<img\b[^>]*>/gi) ?? []) {
      if (!/\salt\s*=/i.test(img)) findings.push({ check: "img-alt", severity: "error", file, message: `<img> without alt: ${img.slice(0, 80)}` });
    }

    // viewport meta (responsive layout)
    if (!/<meta\b[^>]*name\s*=\s*["']viewport["'][^>]*>/i.test(html)) {
      findings.push({ check: "viewport", severity: "warning", file, message: "No viewport meta tag; the page may not be responsive." });
    }

    // internal links and stylesheet references resolve
    const re = /<(?:a|link)\b[^>]*\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const raw = (m[1] ?? m[2] ?? m[3] ?? "").trim();
      if (!raw || EXTERNAL.test(raw)) continue;
      linksChecked += 1;
      const target = resolveHref(file, raw);
      if (!target || !(paths.has(target) || paths.has(`${target}/index.html`.replace(/^\//, "")))) {
        findings.push({ check: "link", severity: "error", file, message: `Internal link does not resolve: ${raw}` });
      }
    }
  }

  if (pages.length === 0) {
    findings.push({ check: "title", severity: "error", file: "(site)", message: "No HTML pages to check." });
  }
  if (opts.offlineCopy) {
    findings.push({
      check: "copy",
      severity: "warning",
      file: "(site)",
      message: "Copy was drafted offline from templates (no language model connected). Review every page before publishing.",
    });
  }

  const verdict = findings.some((f) => f.severity === "error") ? "needs_work" : "pass";
  return { verdict, pagesChecked: pages.length, linksChecked, findings };
}

/** Render a report as Markdown for the quality-review artifact. */
export function renderReport(report: CheckReport, title = "Site quality review"): string {
  const errors = report.findings.filter((f) => f.severity === "error");
  const warnings = report.findings.filter((f) => f.severity === "warning");
  const lines = [
    `# ${title}`,
    "",
    `**Verdict:** ${report.verdict}`,
    "",
    `Checked ${report.pagesChecked} page(s) and ${report.linksChecked} internal link(s) offline: internal links resolve, every image has alt text, exactly one h1 per page, lang attribute present, non-empty title, viewport meta.`,
    "",
    "## Failures",
    "",
    ...(errors.length ? errors.map((f) => `- [${f.check}] ${f.file}: ${f.message}`) : ["- None."]),
    "",
    "## Notes",
    "",
    ...(warnings.length ? warnings.map((f) => `- [${f.check}] ${f.file}: ${f.message}`) : ["- None."]),
    "",
  ];
  return lines.join("\n");
}

function stripComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, "");
}

function normalisePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.?\//, "");
}

/** Resolve an href relative to the page's directory; returns null for traversal above the root. */
export function resolveHref(fromFile: string, href: string): string | null {
  const clean = href.split(/[?#]/)[0]!;
  if (!clean) return normalisePath(fromFile);
  const base = clean.startsWith("/") ? [] : normalisePath(fromFile).split("/").slice(0, -1);
  const parts = [...base];
  for (const seg of clean.replace(/^\//, "").split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (!parts.length) return null;
      parts.pop();
      continue;
    }
    parts.push(seg);
  }
  const joined = parts.join("/");
  return clean.endsWith("/") ? `${joined}/index.html`.replace(/^\//, "") : joined;
}
