import { ConnectedApps } from "@/components/connected-apps";
import { getCurrentUser } from "@/server/auth/current";
import { getDb } from "@/server/db/client";
import { resolveTenantContext } from "@/server/tenancy/context";
import { can } from "@/server/tenancy/rbac";

export const metadata = { title: "Connected apps" };
export const dynamic = "force-dynamic";

export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const session = (await getCurrentUser())!;
  const db = await getDb();
  const ctx = await resolveTenantContext(db, session.user.id);
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-[30px] font-bold tracking-tight">Connected apps</h1>
        <p className="mt-1 max-w-[64ch] text-[15px] text-mute">
          Your own accounts, connected with the narrowest scopes that do the job. Nothing leaves this workspace without one of these and your
          approval of each batch or post. Tokens are encrypted at rest and never shown; every use is listed in the log below.
        </p>
      </header>
      <ConnectedApps canManage={can(ctx, "connection:manage")} justConnected={sp.connected ?? null} oauthError={sp.error ?? null} />
    </div>
  );
}
