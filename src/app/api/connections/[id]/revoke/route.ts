import { json, withAuth } from "@/server/http";
import { revokeConnection } from "@/server/connections/service";

export const POST = withAuth<{ id: string }>(async (_req, { db, ctx }, { id }) => {
  const connection = await revokeConnection(db, ctx, id);
  return json({ connection });
});
