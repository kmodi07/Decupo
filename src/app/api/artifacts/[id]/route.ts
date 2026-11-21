import { json, withAuth } from "@/server/http";
import { getArtifact } from "@/server/missions/service";

/** `?download=1` returns the raw content as a file; otherwise JSON. */
export const GET = withAuth<{ id: string }>(async (req, { db, ctx }, { id }) => {
  const artifact = await getArtifact(db, ctx, id);
  if (new URL(req.url).searchParams.get("download")) {
    const ext = artifact.kind === "markdown" ? "md" : artifact.kind === "json" ? "json" : artifact.kind === "css" ? "css" : "html";
    const name = `${artifact.title.replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}.${ext}`;
    return new Response(artifact.contentText ?? "", {
      headers: {
        "content-type": `${artifact.mimeType}; charset=utf-8`,
        "content-disposition": `attachment; filename="${name}"`,
        "cache-control": "no-store",
      },
    });
  }
  return json({ artifact });
});
