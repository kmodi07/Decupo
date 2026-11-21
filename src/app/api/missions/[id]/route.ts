import { json, withAuth } from "@/server/http";
import { getMission, listApprovals, listArtifacts, listSteps } from "@/server/missions/service";
import { reservationRemaining } from "@/server/ledger/service";

export const GET = withAuth<{ id: string }>(async (_req, { db, ctx }, { id }) => {
  const mission = await getMission(db, ctx, id);
  const [steps, approvals, artifacts] = await Promise.all([
    listSteps(db, ctx, id),
    listApprovals(db, ctx, { missionId: id }),
    listArtifacts(db, ctx, id),
  ]);
  const reservedRemaining = mission.reservationId ? await reservationRemaining(db, mission.reservationId) : 0;
  return json({
    mission,
    steps,
    approvals,
    artifacts: artifacts.map((a) => {
      const { contentText, ...rest } = a;
      void contentText;
      return rest;
    }),
    credits: { estimate: mission.estimateCredits, ceiling: mission.budgetCeilingCredits, settled: mission.settledCredits, reservedRemaining },
  });
});
