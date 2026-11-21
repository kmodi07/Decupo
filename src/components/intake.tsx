"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, errorMessage } from "@/lib/api";
import { cleanAnswers, parseAnswersParam, readOfPlan } from "@/lib/plan-read";
import type { MissionPlan } from "@/server/planner/types";
import { Button, CupiMark, Notice, TextArea } from "./ui";

const EXAMPLES = [
  "Build me a beautiful website for my tutoring company",
  "Find buyers in Delhi for 500 kg of ashwagandha root at Rs 450 per kg",
  "Post Instagram reels for my electronics shop in Bharuch",
  "Create a cited economics presentation on inflation",
];

/**
 * Mission Control intake. As the goal is typed, Cupi previews the plan and
 * asks the planner's own questions (price, stock, language, audience...) so
 * the answers travel into every step's input when the mission is created.
 * Every question is optional; anything left blank is marked as missing by
 * the skills rather than guessed.
 */
export function Intake() {
  const router = useRouter();
  const params = useSearchParams();
  const [goal, setGoal] = useState(() => params.get("goal") ?? "");
  const [answers, setAnswers] = useState<Record<string, string>>(() => parseAnswersParam(params.get("answers")));
  const [plan, setPlan] = useState<MissionPlan | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastRead = useRef("");

  function updateGoal(value: string) {
    setGoal(value);
    if (value.trim().length < 8) {
      setPlan(null);
      lastRead.current = "";
    }
  }

  useEffect(() => {
    const trimmed = goal.trim();
    if (trimmed.length < 8 || trimmed === lastRead.current) return;
    const t = setTimeout(async () => {
      setPreviewing(true);
      try {
        const res = await api<{ plan: MissionPlan }>("/api/plan/preview", { json: { goal: trimmed } });
        lastRead.current = trimmed;
        setPlan(res.plan);
      } catch {
        /* the real plan is built on submit; a failed preview only hides the questions */
      } finally {
        setPreviewing(false);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [goal]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ mission: { id: string } }>("/api/missions", { json: { goal, answers: cleanAnswers(answers) } });
      router.push(`/app/missions/${res.mission.id}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const questions = plan?.questions ?? [];

  return (
    <form onSubmit={submit} className="space-y-4">
      <TextArea
        label="What should the crew work on?"
        name="goal"
        rows={3}
        required
        minLength={8}
        maxLength={500}
        placeholder="Find buyers in Bharuch for 200 bags of basmati rice, message them in Gujarati"
        value={goal}
        onChange={(e) => updateGoal(e.target.value)}
      />

      {plan && (
        <div className="rounded-[14px] bg-white/70 p-4">
          <div className="flex items-start gap-3">
            <CupiMark size={32} className="mt-0.5 shrink-0" />
            <p className="text-[14.5px] leading-relaxed text-ink">{previewing ? "Looking at that again." : readOfPlan(plan)}</p>
          </div>
          {questions.length > 0 && (
            <fieldset className="mt-4">
              <legend className="text-[13.5px] font-semibold text-ink">A few quick things. All optional; blanks are marked, never guessed.</legend>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {questions.map((q) => (
                  <label key={q.key} className="block">
                    <span className="mb-1 block text-[13px] text-mute">{q.prompt}</span>
                    <input
                      name={`answer-${q.key}`}
                      value={answers[q.key] ?? ""}
                      maxLength={500}
                      onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))}
                      className="w-full rounded-[var(--radius-control)] border border-line bg-white px-3 py-2 text-[14.5px] text-midnight focus:border-lavender"
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={busy || goal.trim().length < 8}>
          {busy ? "Cupi is planning" : "Plan this mission"}
        </Button>
        <span className="text-[13px] text-mute">Nothing runs until you approve the estimate.</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button
            type="button"
            key={ex}
            onClick={() => updateGoal(ex)}
            className="rounded-[var(--radius-pill)] border border-line bg-white px-3 py-1.5 text-[13px] text-ink hover:border-lavender hover:bg-lavender-soft"
          >
            {ex}
          </button>
        ))}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
    </form>
  );
}
