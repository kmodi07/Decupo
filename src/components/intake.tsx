"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, errorMessage } from "@/lib/api";
import type { MissionPlan } from "@/server/planner/types";
import { PlanCard } from "./plan-card";
import { Button, LinkButton, Notice, TextArea } from "./ui";

const EXAMPLES = [
  "Build me a beautiful website for my tutoring company",
  "Create a cited economics presentation on inflation",
  "Plan 10 YouTube Shorts a day for my cooking channel",
  "Find and prepare outreach to qualified sales prospects",
];

/**
 * Cupi intake. In `preview` mode (landing page) it calls the public planner
 * and shows the plan without saving. In `create` mode it creates a mission.
 * `hero` and `aside` let the landing page keep the headline and Cupi beside
 * the form while the plan renders full width underneath.
 */
export function Intake({ mode, hero, aside }: { mode: "preview" | "create"; hero?: ReactNode; aside?: ReactNode }) {
  const router = useRouter();
  const params = useSearchParams();
  const [goal, setGoal] = useState(() => params.get("goal") ?? "");
  const [plan, setPlan] = useState<MissionPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "preview") {
        const res = await api<{ plan: MissionPlan }>("/api/plan/preview", { json: { goal } });
        setPlan(res.plan);
      } else {
        const res = await api<{ mission: { id: string } }>("/api/missions", { json: { goal } });
        router.push(`/app/missions/${res.mission.id}`);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const form = (
    <form onSubmit={submit} className="space-y-3">
      <TextArea
        label={mode === "preview" ? "Tell Cupi the dream" : "What should the crew work on?"}
        name="goal"
        rows={3}
        required
        minLength={8}
        maxLength={500}
        placeholder="Launch my tutoring company with a simple website and a pitch deck"
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={busy || goal.trim().length < 8}>
          {busy ? "Cupi is planning" : mode === "preview" ? "Show me the plan" : "Plan this mission"}
        </Button>
        <span className="text-[13px] text-mute">Nothing runs until you approve the estimate.</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button
            type="button"
            key={ex}
            onClick={() => setGoal(ex)}
            className="rounded-[var(--radius-pill)] border border-line bg-white px-3 py-1.5 text-[13px] text-ink hover:border-lavender hover:bg-lavender-soft"
          >
            {ex}
          </button>
        ))}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
    </form>
  );

  if (mode === "create") return form;

  return (
    <div className="space-y-10">
      <div className="grid items-center gap-10 md:grid-cols-[1.15fr_0.85fr]">
        <div>
          {hero}
          <div className="mt-8">{form}</div>
        </div>
        {aside}
      </div>
      {plan && (
        <PlanCard
          plan={plan}
          footer={
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[14px] text-ink">Sign up to run this with 100 free credits.</span>
              <LinkButton href={`/signup?goal=${encodeURIComponent(goal)}`}>Create my account</LinkButton>
            </div>
          }
        />
      )}
    </div>
  );
}
