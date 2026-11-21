import { json, readJson, withAuth } from "@/server/http";
import { decideApproval } from "@/server/missions/service";
import { kickWorker } from "@/server/worker/kick";

export const POST = withAuth<{ id: string }>(async (req, { db, ctx }, { id }) => {
  const approval = await decideApproval(db, ctx, id, await readJson(req));
  await kickWorker(db);
  return json({ approval });
});
