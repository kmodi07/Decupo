import { json, withAuth } from "@/server/http";
import { listArtifacts } from "@/server/missions/service";

export const GET = withAuth<{ id: string }>(async (_req, { db, ctx }, { id }) => {
  const artifacts = await listArtifacts(db, ctx, id);
  return json({ artifacts });
});
