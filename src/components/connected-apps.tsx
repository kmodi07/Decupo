"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { ProviderSummary } from "@/server/connections/providers";
import type { ConnectionView } from "@/server/connections/service";
import type { ConnectionAccessLogEntry } from "@/server/db/schema";
import { Button, Card, Field, Notice, Pill } from "./ui";

type Overview = { providers: ProviderSummary[]; connections: ConnectionView[] };

const ACTION_LABEL: Record<string, string> = {
  connect: "Connected",
  scope_preview: "Scopes shown",
  revoke: "Revoked",
  refresh: "Token refreshed",
  lead_search: "Lead search",
  send: "Message sent",
  publish: "Reel published",
};

export function ConnectedApps({ canManage, justConnected, oauthError }: { canManage: boolean; justConnected: string | null; oauthError: string | null }) {
  const [data, setData] = useState<Overview | null>(null);
  const [log, setLog] = useState<ConnectionAccessLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(oauthError);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [o, l] = await Promise.all([api<Overview>("/api/connections"), api<{ entries: ConnectionAccessLogEntry[] }>("/api/connections/access-log?limit=100")]);
      setData(o);
      setLog(l.entries);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.all([api<Overview>("/api/connections"), api<{ entries: ConnectionAccessLogEntry[] }>("/api/connections/access-log?limit=100")])
      .then(([o, l]) => {
        if (!alive) return;
        setData(o);
        setLog(l.entries);
      })
      .catch((err) => alive && setError(errorMessage(err)));
    return () => {
      alive = false;
    };
  }, []);

  async function connectApiKey(provider: string, form: HTMLFormElement) {
    const fd = new FormData(form);
    setBusy(provider);
    setError(null);
    try {
      await api(`/api/connections/${provider}/connect`, { json: { apiKey: String(fd.get("apiKey") ?? ""), label: String(fd.get("label") ?? "") || undefined } });
      form.reset();
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function connectOAuth(provider: string) {
    setBusy(provider);
    setError(null);
    try {
      const { authorizeUrl } = await api<{ authorizeUrl: string }>(`/api/connections/${provider}/connect`, { method: "POST", json: {} });
      window.location.assign(authorizeUrl);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  }

  async function revoke(id: string) {
    setBusy(id);
    setError(null);
    try {
      await api(`/api/connections/${id}/revoke`, { method: "POST", json: {} });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  if (!data) return <p className="text-mute">Loading connected apps</p>;
  const activeFor = (provider: string) => data.connections.find((c) => c.provider === provider && c.status === "active");

  return (
    <div className="space-y-6">
      {justConnected && !error && (
        <Notice tone="ok">
          {data.providers.find((p) => p.id === justConnected)?.name ?? justConnected} is connected. Missions that were blocked on it can be retried.
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {!canManage && <Notice tone="info">Only owners and admins can connect or revoke accounts. You can see what is connected and how it has been used.</Notice>}

      <ul className="space-y-4">
        {data.providers.map((p) => {
          const active = activeFor(p.id);
          return (
            <li key={p.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[17px] font-semibold">{p.name}</p>
                    <p className="mt-0.5 max-w-[64ch] text-[14px] text-ink">{p.description}</p>
                  </div>
                  {active ? (
                    <Pill tone="done">Connected</Pill>
                  ) : p.adapter.enabled ? (
                    <Pill tone="blocked">Not connected</Pill>
                  ) : (
                    <Pill tone="quiet">Not available here</Pill>
                  )}
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-[13px] font-semibold uppercase tracking-wide text-mute">What it may do</p>
                    <ul className="mt-1.5 space-y-1.5">
                      {p.scopes.map((s) => (
                        <li key={s.id} className="text-[13.5px] leading-snug">
                          <span className="font-medium">{s.label}.</span> <span className="text-mute">{s.why}</span>
                        </li>
                      ))}
                    </ul>
                    {p.notes.length > 0 && (
                      <ul className="mt-3 space-y-1 text-[12.5px] leading-snug text-mute">
                        {p.notes.map((n) => (
                          <li key={n}>{n}</li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="rounded-[12px] bg-cream-deep p-4">
                    {active ? (
                      <div className="space-y-2 text-[14px]">
                        <p>
                          <span className="font-medium">{active.label ?? "Connected account"}</span>
                          <span className="block text-[12.5px] text-mute">
                            {active.kind === "oauth" ? "Signed in with OAuth" : "API key"} on {new Date(active.createdAt).toLocaleDateString()}
                            {active.lastUsedAt ? `, last used ${new Date(active.lastUsedAt).toLocaleString()}` : ", not used yet"}
                          </span>
                        </p>
                        {canManage && (
                          <Button variant="danger" disabled={busy !== null} onClick={() => revoke(active.id)}>
                            Revoke access
                          </Button>
                        )}
                      </div>
                    ) : !p.adapter.enabled ? (
                      <p className="text-[13.5px] leading-snug text-mute">{p.adapter.reason} Ask the operator to enable it; nothing can be connected until then.</p>
                    ) : !canManage ? (
                      <p className="text-[13.5px] text-mute">Not connected.</p>
                    ) : p.authKind === "oauth" ? (
                      <div className="space-y-2">
                        <p className="text-[13.5px] text-mute">You will be sent to the provider to sign in and approve exactly the scopes listed. Decupo never sees your password.</p>
                        <Button disabled={busy !== null} onClick={() => connectOAuth(p.id)}>
                          Connect {p.name.replace(/\s*\(.*\)$/, "")}
                        </Button>
                      </div>
                    ) : (
                      <form
                        className="space-y-3"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void connectApiKey(p.id, e.currentTarget);
                        }}
                      >
                        <Field label={p.apiKey?.label ?? "API key"} name="apiKey" type="password" autoComplete="off" required hint={p.apiKey?.hint} />
                        <Field label="Label (optional)" name="label" placeholder="e.g. Sales team account" />
                        <Button type="submit" disabled={busy !== null}>
                          Connect
                        </Button>
                        {p.adapter.mode === "mock" && <p className="text-[12.5px] text-amber-deep">This server runs the mock adapter: results are labelled test data and nothing is really sent.</p>}
                      </form>
                    )}
                  </div>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>

      <Card tone="deep">
        <h2 className="text-[18px] font-bold tracking-tight">Access log</h2>
        <p className="mt-1 text-[13.5px] text-mute">Every connect, revoke and external call made through these accounts. Tokens are never logged.</p>
        {!log || log.length === 0 ? (
          <p className="mt-3 text-[14px] text-mute">Nothing yet.</p>
        ) : (
          <table className="mt-3 w-full text-[13.5px]">
            <thead className="text-left text-[12.5px] text-mute">
              <tr>
                <th className="py-2 font-medium">When</th>
                <th className="py-2 font-medium">Provider</th>
                <th className="py-2 font-medium">What</th>
                <th className="py-2 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {log.map((e) => (
                <tr key={e.id} className="align-top">
                  <td className="py-2 tabular-nums text-mute">{new Date(e.createdAt).toLocaleString()}</td>
                  <td className="py-2">{e.provider}</td>
                  <td className="py-2">
                    <span className="font-medium">{ACTION_LABEL[e.action] ?? e.action}</span>
                    {e.outcome !== "ok" && <span className="ml-1.5 text-rose-deep">{e.outcome}</span>}
                    <span className="block text-[12px] text-mute">{e.actor.replace(/^user:.*/, "you").replace(/^agent:/, "")}</span>
                  </td>
                  <td className="py-2 text-mute">
                    {describeDetail(e.detail)}
                    {e.missionId && (
                      <Link href={`/app/missions/${e.missionId}`} className="ml-1 text-lavender-deep hover:underline">
                        mission
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function describeDetail(d: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof d.to === "string") parts.push(`to ${d.to}`);
  if (typeof d.channel === "string") parts.push(String(d.channel));
  if (typeof d.subject === "string" && d.subject) parts.push(`"${d.subject}"`);
  if (typeof d.leads === "number") parts.push(`${d.leads} contacts`);
  if (typeof d.title === "string") parts.push(`"${d.title}"`);
  if (typeof d.postId === "string") parts.push(`post ${d.postId}`);
  if (Array.isArray(d.scopes)) parts.push(`${d.scopes.length} scope${d.scopes.length === 1 ? "" : "s"}`);
  if (typeof d.adapter === "string" && d.adapter === "mock") parts.push("mock adapter");
  if (typeof d.reason === "string") parts.push(String(d.reason));
  if (typeof d.error === "string") parts.push(String(d.error));
  return parts.join(", ");
}
