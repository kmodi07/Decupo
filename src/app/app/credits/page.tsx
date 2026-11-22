import { LocalTime } from "@/components/local-time";
import { Card, Credits } from "@/components/ui";
import { getCurrentUser } from "@/server/auth/current";
import { getDb } from "@/server/db/client";
import { getBalance, listLedger } from "@/server/ledger/service";
import { resolveTenantContext } from "@/server/tenancy/context";

export const metadata = { title: "Credits" };
export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  grant: "Credits added",
  purchase: "Credits purchased",
  reserve: "Reserved for a mission",
  settle: "Used by a step",
  release: "Unused credits returned",
  adjustment: "Adjustment",
};

export default async function CreditsPage() {
  const session = (await getCurrentUser())!;
  const db = await getDb();
  const ctx = await resolveTenantContext(db, session.user.id);
  const [balance, entries] = await Promise.all([getBalance(db, ctx.orgId), listLedger(db, ctx.orgId, 200)]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-[30px] font-bold tracking-tight">Credits</h1>
        <p className="mt-1 max-w-[60ch] text-[15px] text-mute">
          Every movement is recorded and never edited. Reserved credits are held for missions you have authorised; they are used by steps or
          returned when the mission ends.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card tone="night">
          <p className="text-[13px] text-cream/60">Available</p>
          <p className="text-[32px] font-bold tabular-nums tracking-tight">{balance.available.toLocaleString()}</p>
        </Card>
        <Card tone="deep">
          <p className="text-[13px] text-mute">Reserved</p>
          <p className="text-[32px] font-bold tabular-nums tracking-tight">{balance.reserved.toLocaleString()}</p>
        </Card>
        <Card tone="deep">
          <p className="text-[13px] text-mute">Balance</p>
          <p className="text-[32px] font-bold tabular-nums tracking-tight">{balance.balance.toLocaleString()}</p>
        </Card>
      </div>

      <Card>
        <h2 className="text-[18px] font-bold tracking-tight">Ledger</h2>
        <table className="mt-3 w-full text-[14px]">
          <thead className="text-left text-[13px] text-mute">
            <tr>
              <th className="py-2 font-medium">When</th>
              <th className="py-2 font-medium">What</th>
              <th className="py-2 text-right font-medium">Balance</th>
              <th className="py-2 text-right font-medium">Reserved</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="py-2 align-top tabular-nums text-mute">
                  <LocalTime value={e.createdAt} />
                </td>
                <td className="py-2 align-top">
                  <span className="font-medium">{KIND_LABEL[e.kind] ?? e.kind}</span>
                  {e.description && <span className="block text-[13px] text-mute">{e.description}</span>}
                </td>
                <td className={`py-2 text-right align-top tabular-nums ${e.deltaBalance < 0 ? "text-rose-deep" : e.deltaBalance > 0 ? "text-mint-deep" : "text-mute"}`}>
                  {e.deltaBalance === 0 ? "" : e.deltaBalance > 0 ? `+${e.deltaBalance}` : e.deltaBalance}
                </td>
                <td className="py-2 text-right align-top tabular-nums text-mute">{e.deltaReserved === 0 ? "" : e.deltaReserved > 0 ? `+${e.deltaReserved}` : e.deltaReserved}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {entries.length === 0 && <p className="mt-2 text-[14px] text-mute">No movements yet.</p>}
        <p className="mt-4 text-[13px] text-mute">
          Paid plans and top-ups are not available yet. A step that cannot run is never charged. You have <Credits n={balance.balance} /> in total.
        </p>
      </Card>
    </div>
  );
}
