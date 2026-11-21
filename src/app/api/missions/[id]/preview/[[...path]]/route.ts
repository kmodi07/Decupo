import { and, eq } from "drizzle-orm";
import { artifacts } from "@/server/db/schema";
import { NotFoundError } from "@/server/errors";
import { withAuth } from "@/server/http";
import { getMission } from "@/server/missions/service";
import { requirePermission } from "@/server/tenancy/rbac";

/**
 * Serves the generated site files of a mission to the signed-in tenant.
 * `/api/missions/:id/preview/index.html` is the entry point; every link inside
 * the site is relative, so pages resolve under this prefix.
 *
 * The CSP forbids scripts, frames, plugins and form submission: the preview
 * can only show HTML and the site's own stylesheet.
 */
const PREVIEW_CSP = [
  "default-src 'none'",
  "script-src 'none'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join("; ");

const SERVABLE: Record<string, string> = { html: "text/html; charset=utf-8", css: "text/css; charset=utf-8" };

export const GET = withAuth<{ id: string; path?: string[] }>(async (req, { db, ctx }, { id, path }) => {
  requirePermission(ctx, "artifact:read");
  await getMission(db, ctx, id); // tenant check: 404 for other organisations

  const segments = path ?? [];
  if (segments.length === 0) {
    const url = new URL(req.url);
    url.pathname = `${url.pathname.replace(/\/$/, "")}/index.html`;
    return Response.redirect(url.toString(), 302);
  }
  if (segments.some((s) => !s || s === "." || s === ".." || s.includes("\\"))) throw new NotFoundError("File");
  const filePath = segments.join("/");

  const [file] = await db
    .select()
    .from(artifacts)
    .where(and(eq(artifacts.orgId, ctx.orgId), eq(artifacts.missionId, id), eq(artifacts.path, filePath)))
    .orderBy(artifacts.createdAt)
    .limit(1);
  const type = file ? SERVABLE[file.kind] : undefined;
  if (!file || !type || file.contentText === null) throw new NotFoundError("File");

  return new Response(file.contentText, {
    headers: {
      "content-type": type,
      "content-security-policy": PREVIEW_CSP,
      "x-content-type-options": "nosniff",
      "content-disposition": "inline",
      "cache-control": "private, no-store",
    },
  });
});
