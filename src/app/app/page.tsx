import Link from "next/link";
import { Suspense } from "react";
import { Intake } from "@/components/intake";
import { Card, Credits, MissionStatusPill } from "@/components/ui";
import { getCurrentUser } from "@/server/auth/current";
import { getDb } from "@/server/db/client";
import { listMissions } from "@/server/missions/service";
import { resolveTenantContext } from "@/server/tenancy/context";

export const metadata = { title: "Missions" };
export const dynamic = "force-dynamic";

export default async function MissionsPage() {
  const session = (await getCurrentUser())!;
  const db = await getDb();
  const ctx = await resolveTenantContext(db, session.user.id);
  const missions = await listMissions(db, ctx);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <h1 className="text-[30px] font-bold tracking-tight">Missions</h1>
        <p className="mt-1 text-[15px] text-mute">Give Cupi a goal. You will see the plan and the estimate before anything runs.</p>
      </header>

      <Card tone="deep">
        <Suspense>
          <Intake />
        </Suspense>
      </Card>

      {missions.length === 0 ? (
        <p className="text-[15px] text-mute">No missions yet. The first one takes about a minute to plan and run.</p>
      ) : (
        <ul className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-white">
          {missions.map((m) => (
            <li key={m.id}>
              <Link href={`/app/missions/${m.id}`} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-lavender-soft/40">
                <div className="min-w-0">
                  <p className="truncate text-[16px] font-semibold">{m.title}</p>
                  <p className="truncate text-[13.5px] text-mute">
                    {m.summary ?? m.goal}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="hidden text-[13px] tabular-nums text-mute sm:inline">
                    {m.settledCredits > 0 ? <Credits n={m.settledCredits} /> : <>est. <Credits n={m.estimateCredits} /></>}
                  </span>
                  <MissionStatusPill status={m.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
