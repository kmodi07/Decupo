"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { CupiMark } from "./ui";

const NAV = [
  { href: "/app", label: "Missions" },
  { href: "/app/approvals", label: "Approvals" },
  { href: "/app/credits", label: "Credits" },
  { href: "/app/connections", label: "Connected apps" },
  { href: "/app/skills", label: "Skills" },
];

export function Rail({
  user,
  credits,
  offline,
}: {
  user: { name: string; email: string; role: string };
  credits: { balance: number; reserved: number; available: number };
  offline: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }
  return (
    <aside className="flex shrink-0 flex-col bg-midnight text-cream md:sticky md:top-0 md:h-dvh md:w-64">
      <div className="flex items-center justify-between px-5 py-5 md:block">
        <Link href="/" className="inline-flex items-center gap-2 text-[18px] font-bold tracking-tight">
          <CupiMark size={30} />
          Decupo
        </Link>
        <nav className="flex gap-1 md:mt-8 md:flex-col" aria-label="Mission Control">
          {NAV.map((n) => {
            const active = n.href === "/app" ? pathname === "/app" || pathname.startsWith("/app/missions") : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-[var(--radius-control)] px-3 py-2 text-[14.5px] font-medium transition-colors ${
                  active ? "bg-cream/10 text-cream" : "text-cream/70 hover:bg-cream/5 hover:text-cream"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto space-y-4 px-5 pb-5">
        <div className="rounded-[14px] bg-cream/5 p-4">
          <p className="text-[12.5px] text-cream/60">Credits available</p>
          <p className="text-[26px] font-bold tabular-nums tracking-tight">{credits.available.toLocaleString()}</p>
          {credits.reserved > 0 && <p className="text-[12.5px] text-cream/60">{credits.reserved.toLocaleString()} reserved for running missions</p>}
        </div>
        {offline && (
          <p className="rounded-[10px] bg-coral/15 px-3 py-2 text-[12.5px] leading-snug text-coral">
            Offline mode: agents produce labelled placeholder drafts until a language-model provider is connected.
          </p>
        )}
        <div className="flex items-center justify-between gap-2 text-[13px]">
          <div className="min-w-0">
            <p className="truncate font-medium">{user.name}</p>
            <p className="truncate text-cream/60">{user.role}</p>
          </div>
          <button onClick={logout} className="rounded-[8px] px-2 py-1 text-cream/70 hover:bg-cream/10 hover:text-cream">
            Log out
          </button>
        </div>
      </div>
    </aside>
  );
}
