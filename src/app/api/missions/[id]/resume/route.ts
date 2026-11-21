import { json, withAuth } from "@/server/http";
import { resumeMission } from "@/server/missions/service";

export const POST = withAuth<{ id: string }>(async (_req, { db, ctx }, { id }) => {
  const mission = await resumeMission(db, ctx, id);
  return json({ mission });
});
