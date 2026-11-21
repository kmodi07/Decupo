"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { Approval } from "@/lib/types";
import { Button, Card, Notice, Pill } from "./ui";

export function ApprovalsList() {
  const [items, setItems] = useState<Approval[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    try {
      setItems((await api<{ approvals: Approval[] }>("/api/approvals")).approvals);
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  useEffect(() => {
    let alive = true;
    api<{ approvals: Approval[] }>("/api/approvals")
      .then((r) => alive && setItems(r.approvals))
      .catch((err) => alive && setError(errorMessage(err)));
    return () => {
      alive = false;
    };
  }, []);

  async function decide(id: string, decision: "approved" | "rejected") {
    setBusy(id);
    setError(null);
    try {
      await api(`/api/approvals/${id}/decision`, { json: { decision } });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  if (!items) return <p className="text-mute">Loading approvals</p>;
  const pending = items.filter((a) => a.status === "pending");
  const decided = items.filter((a) => a.status !== "pending");
  return (
    <div className="space-y-6">
      {error && <Notice tone="error">{error}</Notice>}
      <Card>
        <h2 className="text-[18px] font-bold tracking-tight">Waiting on you</h2>
        {pending.length === 0 ? (
          <p className="mt-2 text-[14px] text-mute">Nothing to decide right now.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {pending.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-coral-soft/60 p-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold">{a.title}</p>
                  <p className="text-[13.5px] text-ink">{a.description}</p>
                  <Link href={`/app/missions/${a.missionId}`} className="text-[13px] font-medium text-lavender-deep hover:underline">
                    Open the mission
                  </Link>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" disabled={busy !== null} onClick={() => decide(a.id, "rejected")}>
                    Decline
                  </Button>
                  <Button disabled={busy !== null} onClick={() => decide(a.id, "approved")}>
                    Approve
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {decided.length > 0 && (
        <Card tone="deep">
          <h2 className="text-[16px] font-semibold">History</h2>
          <ul className="mt-2 divide-y divide-line">
            {decided.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-[14px]">
                <Link href={`/app/missions/${a.missionId}`} className="truncate hover:underline">
                  {a.title}
                </Link>
                <Pill tone={a.status === "approved" ? "done" : "quiet"}>{a.status}</Pill>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
