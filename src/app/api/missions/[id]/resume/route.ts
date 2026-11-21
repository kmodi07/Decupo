import { json, withAuth } from "@/server/http";
import { resumeMission } from "@/server/missions/service";
import { kickWorker } from "@/server/worker/kick";

export const POST = withAuth<{ id: string }>(async (_req, { db, ctx }, { id }) => {
  const mission = await resumeMission(db, ctx, id);
  await kickWorker(db);
  return json({ mission });
});
