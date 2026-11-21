import { json, readJson, withAuth } from "@/server/http";
import { cancelMission } from "@/server/missions/service";

export const POST = withAuth<{ id: string }>(async (req, { db, ctx }, { id }) => {
  const body = (await readJson(req)) as { reason?: string };
  const mission = await cancelMission(db, ctx, id, typeof body.reason === "string" ? body.reason.slice(0, 500) : undefined);
  return json({ mission });
});
