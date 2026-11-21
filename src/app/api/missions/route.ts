import { json, readJson, withAuth } from "@/server/http";
import { createMission, listMissions } from "@/server/missions/service";

export const GET = withAuth(async (_req, { db, ctx }) => {
  const missions = await listMissions(db, ctx);
  return json({ missions });
});

export const POST = withAuth(async (req, { db, ctx }) => {
  const body = await readJson(req);
  const { mission, plan } = await createMission(db, ctx, body);
  return json({ mission, plan }, { status: 201 });
});
