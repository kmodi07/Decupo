import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current";
import { getDb } from "@/server/db/client";
import { getBalance } from "@/server/ledger/service";
import { resolveTenantContext } from "@/server/tenancy/context";
import { Rail } from "@/components/rail";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentUser();
  if (!session) redirect("/login");
  const db = await getDb();
  const ctx = await resolveTenantContext(db, session.user.id);
  const credits = await getBalance(db, ctx.orgId);
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <Rail user={{ name: session.user.name, email: session.user.email, role: ctx.role }} credits={credits} />
      <main className="min-w-0 flex-1 px-5 py-6 sm:px-8 sm:py-8">{children}</main>
    </div>
  );
}
