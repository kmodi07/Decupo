"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { Approval, Artifact, MissionDetail, MissionEvent, MissionPlan } from "@/lib/types";
import { TERMINAL_MISSION } from "@/server/missions/state";
import { PlanCard } from "./plan-card";
import { AgentBadge, Button, Card, Credits, formatTime, MissionStatusPill, Notice, Pill, StepStatusPill } from "./ui";

type Detail = MissionDetail;

export function MissionControl({ id }: { id: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [events, setEvents] = useState<MissionEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const lastSeq = useRef(0);

  const router = useRouter();

  /** Reload the mission and catch up on any events the live stream missed. */
  const refresh = useCallback(async () => {
    try {
      const [d, r] = await Promise.all([
        api<Detail>(`/api/missions/${id}`),
        api<{ events: MissionEvent[] }>(`/api/missions/${id}/events?after=${lastSeq.current}`),
      ]);
      if (r.events.length) {
        lastSeq.current = r.events.at(-1)!.seq;
        setEvents((prev) => {
          const seen = new Set(prev.map((e) => e.seq));
          return [...prev, ...r.events.filter((e) => !seen.has(e.seq))];
        });
      }
      setDetail(d);
      if (TERMINAL_MISSION.has(d.mission.status)) router.refresh(); // server shell (credits in the rail)
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [id, router]);

  // Initial load + event history.
  useEffect(() => {
    let alive = true;
    Promise.all([api<Detail>(`/api/missions/${id}`), api<{ events: MissionEvent[] }>(`/api/missions/${id}/events`)])
      .then(([d, r]) => {
        if (!alive) return;
        lastSeq.current = r.events.at(-1)?.seq ?? 0;
        setEvents(r.events);
        setDetail(d);
      })
      .catch((err) => alive && setError(errorMessage(err)));
    return () => {
      alive = false;
    };
  }, [id]);

  // Live updates over SSE; each event also refreshes the detail view (debounced).
  useEffect(() => {
    if (!detail || TERMINAL_MISSION.has(detail.mission.status)) return;
    const es = new EventSource(`/api/missions/${id}/events?after=${lastSeq.current}`);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAny = (e: MessageEvent) => {
      try {
        const ev = JSON.parse(e.data) as MissionEvent;
        if (ev.seq <= lastSeq.current) return;
        lastSeq.current = ev.seq;
        setEvents((prev) => [...prev, ev]);
      } catch {
        /* keep-alive or done */
      }
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 250);
    };
    const types = [
      "mission.started", "mission.paused", "mission.resumed", "mission.canceled", "mission.completed", "mission.partially_completed",
      "mission.failed", "mission.awaiting_review", "mission.authorized", "step.ready", "step.started", "step.succeeded", "step.failed",
      "step.blocked", "step.skipped", "step.retrying", "step.log", "approval.requested", "approval.approved", "approval.rejected",
      "artifact.created", "credits.released", "budget.overage",
    ];
    for (const t of types) es.addEventListener(t, onAny as EventListener);
    es.addEventListener("done", () => {
      es.close();
      void refresh();
    });
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    return () => {
      es.close();
      clearTimeout(timer);
    };
    // Reconnect only when the mission leaves/enters a terminal state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, detail?.mission.status ? TERMINAL_MISSION.has(detail.mission.status) : null]);

  async function act(path: string, label: string, body?: unknown) {
    setBusy(label);
    setError(null);
    try {
      await api(path, { method: "POST", json: body ?? {} });
      await refresh();
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  if (!detail) {
    return error ? <Notice tone="error">{error}</Notice> : <p className="text-mute">Loading mission</p>;
  }
  const { mission, steps, approvals, artifacts, credits } = detail;
  const plan = mission.plan as unknown as MissionPlan;
  const pending = approvals.filter((a) => a.status === "pending");
  const canAuthorize = mission.status === "awaiting_authorization" || mission.status === "estimated";
  const canPause = ["queued", "running", "awaiting_review"].includes(mission.status);
  const canResume = mission.status === "paused";
  const canCancel = !TERMINAL_MISSION.has(mission.status);
  const live: "connecting" | "live" | "closed" = TERMINAL_MISSION.has(mission.status) ? "closed" : connected ? "live" : "connecting";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <nav className="text-[13.5px] text-mute">
        <Link href="/app" className="hover:text-midnight">
          Missions
        </Link>{" "}
        / {mission.title}
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[28px] font-bold leading-tight tracking-tight">{mission.title}</h1>
            <MissionStatusPill status={mission.status} />
          </div>
          <p className="mt-1 max-w-[70ch] text-[15px] text-ink">{mission.goal}</p>
          {mission.summary && <p className="mt-1 text-[14px] text-mute">{mission.summary}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {canPause && (
            <Button variant="ghost" disabled={busy !== null} onClick={() => act(`/api/missions/${id}/pause`, "pause")}>
              {busy === "pause" ? "Pausing" : "Pause"}
            </Button>
          )}
          {canResume && (
            <Button variant="secondary" disabled={busy !== null} onClick={() => act(`/api/missions/${id}/resume`, "resume")}>
              {busy === "resume" ? "Resuming" : "Resume"}
            </Button>
          )}
          {canCancel && (
            <Button
              variant="danger"
              disabled={busy !== null}
              onClick={() => {
                if (window.confirm("Stop this mission? Finished steps keep their deliverables; unused credits are released.")) {
                  void act(`/api/missions/${id}/cancel`, "cancel");
                }
              }}
            >
              {busy === "cancel" ? "Stopping" : "Stop mission"}
            </Button>
          )}
        </div>
      </header>

      {error && <Notice tone="error">{error}</Notice>}

      {canAuthorize && (
        <PlanCard
          plan={plan}
          footer={
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-[14px] text-ink">
                  Reserve <Credits n={mission.estimateCredits} /> and start? You can stop at any time.
                </span>
                <Button disabled={busy !== null} onClick={() => act(`/api/missions/${id}/authorize`, "authorize")}>
                  {busy === "authorize" ? "Starting" : "Go ahead"}
                </Button>
              </div>
              {error && <Notice tone="error">{error}</Notice>}
            </div>
          }
        />
      )}

      {pending.length > 0 && (
        <Card className="border-coral/50">
          <h2 className="text-[18px] font-bold tracking-tight">Needs your decision</h2>
          <ul className="mt-3 space-y-3">
            {pending.map((a) => (
              <ApprovalRow key={a.id} approval={a} busy={busy} onDecide={(d) => act(`/api/approvals/${a.id}/decision`, `approval:${a.id}`, { decision: d })} />
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <Card>
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-bold tracking-tight">Crew and steps</h2>
              <span className="text-[13px] text-mute">{steps.filter((s) => s.status === "succeeded").length} of {steps.length} done</span>
            </div>
            <ol className="mt-4 space-y-3">
              {steps.map((s, i) => (
                <li key={s.id} className="flex items-start gap-3 rounded-[12px] p-2 -mx-2">
                  <span className="mt-1 w-4 text-right text-[13px] tabular-nums text-mute">{i + 1}</span>
                  <AgentBadge name={s.agent} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-semibold">{s.title}</span>
                      <StepStatusPill status={s.status} />
                    </div>
                    <p className="text-[13px] text-mute">
                      {s.agent}, {s.skillId} v{s.skillVersion}
                      {s.attempts > 1 ? `, attempt ${s.attempts}` : ""}
                      {s.actualCredits > 0 ? `, used ${s.actualCredits} credits` : `, about ${s.estimatedCredits} credits`}
                    </p>
                    {s.error && <p className="mt-1 text-[13.5px] leading-snug text-amber-deep">{s.error}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          <Card>
            <h2 className="text-[18px] font-bold tracking-tight">Deliverables</h2>
            {artifacts.length === 0 ? (
              <p className="mt-2 text-[14px] text-mute">Nothing produced yet. Deliverables appear here as steps finish.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {artifacts.map((a) => (
                  <ArtifactRow key={a.id} artifact={a} />
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card tone="night">
            <h2 className="text-[16px] font-semibold">Credits for this mission</h2>
            <dl className="mt-3 grid grid-cols-3 gap-3 text-[13px]">
              <div>
                <dt className="text-cream/60">Estimate</dt>
                <dd className="text-[20px] font-bold tabular-nums">{credits.estimate}</dd>
              </div>
              <div>
                <dt className="text-cream/60">Still reserved</dt>
                <dd className="text-[20px] font-bold tabular-nums">{credits.reservedRemaining}</dd>
              </div>
              <div>
                <dt className="text-cream/60">Used</dt>
                <dd className="text-[20px] font-bold tabular-nums">{credits.settled}</dd>
              </div>
            </dl>
            {credits.ceiling > 0 && <p className="mt-2 text-[12.5px] text-cream/60">Ceiling {credits.ceiling}. Steps that would exceed it are blocked, not overdrawn.</p>}
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-bold tracking-tight">Updates</h2>
              <Pill tone={live === "live" ? "done" : live === "closed" ? "quiet" : "active"} pulse={live === "live"}>
                {live === "live" ? "Live" : live === "closed" ? "Finished" : "Connecting"}
              </Pill>
            </div>
            <ol className="mt-3 max-h-[32rem] space-y-2 overflow-y-auto pr-1">
              {[...events].reverse().map((e, i) => (
                <li key={e.id} className={`rounded-[10px] px-2.5 py-2 text-[13.5px] ${i === 0 ? "glow-in" : ""}`}>
                  <div className="flex items-center gap-2">
                    <ActorMark actor={e.actor} />
                    <span className="font-medium">{describeEvent(e)}</span>
                    <span className="ml-auto shrink-0 text-[12px] tabular-nums text-mute">{formatTime(e.createdAt)}</span>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ActorMark({ actor }: { actor: string }) {
  if (actor.startsWith("agent:")) return <AgentBadge name={actor.slice(6)} size="sm" />;
  if (actor.startsWith("user:")) return <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-cream-deep text-[11px] font-bold text-ink">You</span>;
  return <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-soft text-[11px] font-bold text-mute">S</span>;
}

function describeEvent(e: MissionEvent): string {
  const p = e.payload as Record<string, unknown>;
  const key = typeof p.key === "string" ? p.key : "";
  switch (e.type) {
    case "mission.created":
      return "Mission created";
    case "mission.estimated":
      return `Plan ready: ${p.stepCount} steps, about ${p.estimateCredits} credits`;
    case "mission.authorized":
      return `Go-ahead given; ${p.budgetCeilingCredits} credits reserved`;
    case "mission.started":
      return "Crew started";
    case "mission.paused":
      return "Paused";
    case "mission.resumed":
      return "Resumed";
    case "mission.canceled":
      return "Stopped";
    case "mission.completed":
      return `Completed: ${p.summary}`;
    case "mission.partially_completed":
      return `Partially completed: ${p.summary}`;
    case "mission.failed":
      return `Failed: ${p.summary}`;
    case "mission.awaiting_review":
      return "Waiting for your review";
    case "step.ready":
      return `${key} is ready`;
    case "step.started":
      return `${key} started${Number(p.attempt) > 1 ? ` (attempt ${p.attempt})` : ""}`;
    case "step.succeeded":
      return `${key} done${p.summary ? `: ${p.summary}` : ""}`;
    case "step.failed":
      return `${key} failed: ${p.error}`;
    case "step.blocked":
      return `${key} blocked: ${p.error}`;
    case "step.skipped":
      return `${key} skipped (${p.reason})`;
    case "step.retrying":
      return `${key} will retry: ${p.error}`;
    case "step.log":
      return `${key}: ${p.message}`;
    case "approval.requested":
      return `Approval requested for ${key}`;
    case "approval.approved":
      return "You approved";
    case "approval.rejected":
      return "You declined";
    case "artifact.created":
      return `New deliverable: ${p.title}`;
    case "credits.released":
      return `${p.credits} unused credits released`;
    case "budget.overage":
      return `${key} used ${p.overage} more credits than were reserved; capped at the reservation`;
    default:
      return e.type;
  }
}

function ApprovalRow({ approval, busy, onDecide }: { approval: Approval; busy: string | null; onDecide: (d: "approved" | "rejected") => void }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-coral-soft/60 p-3">
      <div className="min-w-0">
        <p className="text-[15px] font-semibold">{approval.title}</p>
        <p className="text-[13.5px] text-ink">{approval.description}</p>
        <p className="mt-0.5 text-[12.5px] text-mute">Action class: {approval.actionClass}. Nothing happens until you decide.</p>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" disabled={busy !== null} onClick={() => onDecide("rejected")}>
          Decline
        </Button>
        <Button disabled={busy !== null} onClick={() => onDecide("approved")}>
          Approve
        </Button>
      </div>
    </li>
  );
}

function ArtifactRow({ artifact }: { artifact: Omit<Artifact, "contentText"> }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  async function toggle() {
    if (!open && content === null) {
      const r = await api<{ artifact: Artifact }>(`/api/artifacts/${artifact.id}`);
      setContent(r.artifact.contentText ?? "");
    }
    setOpen((o) => !o);
  }
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AgentBadge name={artifact.producedBy} size="sm" />
          <span className="text-[15px] font-semibold">{artifact.title}</span>
          <span className="text-[12.5px] text-mute">{artifact.kind}</span>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" className="px-3 py-1.5 text-[13.5px]" onClick={toggle}>
            {open ? "Hide" : "Open"}
          </Button>
          <a
            className="inline-flex items-center rounded-[var(--radius-control)] border border-line px-3 py-1.5 text-[13.5px] font-semibold hover:bg-lavender-soft"
            href={`/api/artifacts/${artifact.id}?download=1`}
          >
            Download
          </a>
        </div>
      </div>
      {open && (
        <div className="artifact-body mt-3 rounded-[12px] bg-cream-deep p-4 text-[14.5px]" dangerouslySetInnerHTML={{ __html: renderMarkdown(content ?? "") }} />
      )}
    </li>
  );
}

/** Tiny, safe Markdown subset renderer (headings, lists, quotes, paragraphs). Escapes HTML first. */
function renderMarkdown(src: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = esc(src).split(/\r?\n/);
  const out: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) out.push(`<ul>${list.map((l) => `<li>${inline(l)}</li>`).join("")}</ul>`);
    list = [];
  };
  const inline = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`(.+?)`/g, "<code>$1</code>");
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^\s*[-*]\s+/.test(line)) {
      list.push(line.replace(/^\s*[-*]\s+/, ""));
      continue;
    }
    flush();
    if (!line.trim()) continue;
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) out.push(`<h${h[1]!.length}>${inline(h[2]!)}</h${h[1]!.length}>`);
    else if (line.startsWith("&gt; ")) out.push(`<blockquote>${inline(line.slice(5))}</blockquote>`);
    else out.push(`<p>${inline(line)}</p>`);
  }
  flush();
  return out.join("");
}
