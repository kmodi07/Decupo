import { json, withAuth } from "@/server/http";
import { connectionsOverview } from "@/server/connections/service";

/** Providers (with scope preview and adapter status) and this workspace's connections. Never includes tokens. */
export const GET = withAuth(async (_req, { db, ctx }) => {
  return json(await connectionsOverview(db, ctx));
});
