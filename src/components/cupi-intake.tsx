"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { api, errorMessage } from "@/lib/api";
import { cleanAnswers, readOfPlan } from "@/lib/plan-read";
import type { MissionPlan } from "@/server/planner/types";
import { CupiAvatar, type CupiMood } from "./cupi-avatar";
import { PlanCard } from "./plan-card";
import { Button, LinkButton, Notice } from "./ui";

const EXAMPLES = [
  "a website for my tutoring company",
  "buyers in Delhi for 500 kg of ashwagandha root at Rs 450 per kg",
  "a week of Instagram reels for my electronics shop in Bharuch",
  "a cited presentation on inflation",
  "a topic bank for my cooking channel",
  "research on the market for pet subscription boxes",
  "outreach to qualified sales prospects",
];

/** Example chips read naturally whatever the mission type. */
function phrase(ex: string): string {
  if (ex.startsWith("buyers")) return `Find ${ex}`;
  if (ex.startsWith("a week of")) return `Post ${ex}`;
  return `Make ${ex}`;
}

const GREETINGS = ["Hi, I'm Cupi. What should we make?", "Tell me the dream in a sentence or two.", "Start with what you want to exist by next week."];

/**
 * The front door. Cupi greets the visitor, reads the goal as they type, and
 * answers with a one-line read from the real planner (which agents, how many
 * steps, roughly what it costs) before showing the full plan. Nothing is saved
 * until they sign up; the preview endpoint is public and rule-based.
 */
export function CupiIntake() {
  const params = useSearchParams();
  const [goal, setGoal] = useState(() => params.get("goal") ?? "");
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<MissionPlan | null>(null);
  const [showFull, setShowFull] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [greeting] = useState(() => GREETINGS[0]!);
  const placeholder = useTypedPlaceholder(EXAMPLES, focused || goal.length > 0);
  const lastRead = useRef("");

  // Live read: ask the planner what it would do, debounced, while the person types.
  function updateGoal(value: string) {
    setGoal(value);
    if (value.trim().length < 8) {
      setPlan(null);
      setShowFull(false);
      lastRead.current = "";
    }
  }

  useEffect(() => {
    const trimmed = goal.trim();
    if (trimmed.length < 8 || trimmed === lastRead.current) return;
    const t = setTimeout(async () => {
      setBusy(true);
      setError(null);
      try {
        const res = await api<{ plan: MissionPlan }>("/api/plan/preview", { json: { goal: trimmed } });
        lastRead.current = trimmed;
        setPlan(res.plan);
        setShowFull(false);
        setCelebrate(true);
        setTimeout(() => setCelebrate(false), 2200);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setBusy(false);
      }
    }, 700);
    return () => clearTimeout(t);
  }, [goal]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (plan) setShowFull(true);
  }

  const mood: CupiMood = busy ? "thinking" : celebrate ? "happy" : focused ? "listening" : "idle";
  const bubble = busy ? "Thinking about who to bring and what it costs." : plan ? readOfPlan(plan, { withQuestion: true }) : focused && goal.trim().length < 8 ? "Go on, I'm listening." : greeting;

  return (
    <div className="space-y-8">
      <div className="grid items-end gap-6 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-10">
        {/* Cupi and the speech bubble */}
        <div className="cupi-stage relative mx-auto w-full max-w-[380px]">
          <div className="cupi-orb cupi-orb-a" aria-hidden />
          <div className="cupi-orb cupi-orb-b" aria-hidden />
          <CupiAvatar mood={mood} size={300} className="relative mx-auto block w-full max-w-[300px]" />
        </div>

        <div>
          <p className="cupi-bubble" role="status" aria-live="polite">
            <span key={bubble} className="cupi-bubble-text">
              {bubble}
            </span>
          </p>
          <form onSubmit={submit} className="mt-4 space-y-3">
            <label className="block">
              <span className="sr-only">Tell Cupi the goal</span>
              <textarea
                name="goal"
                rows={3}
                required
                minLength={8}
                maxLength={500}
                placeholder={placeholder}
                value={goal}
                onChange={(e) => updateGoal(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                className="cupi-input w-full resize-none rounded-[22px] border border-line bg-white px-5 py-4 text-[18px] leading-relaxed text-midnight shadow-[var(--shadow-float)] placeholder:text-mute/60 focus:border-lavender"
              />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={!plan || busy}>
                {busy ? "Cupi is planning" : showFull ? "Plan is below" : "Show me the full plan"}
              </Button>
              <span className="text-[13.5px] text-mute">Nothing runs until you approve the estimate.</span>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {EXAMPLES.slice(0, 3).map((ex) => (
                <button
                  type="button"
                  key={ex}
                  onClick={() => updateGoal(phrase(ex))}
                  className="rounded-[var(--radius-pill)] border border-line bg-white/70 px-3 py-1.5 text-[13px] text-ink transition-colors hover:border-lavender hover:bg-lavender-soft"
                >
                  {ex}
                </button>
              ))}
            </div>
            {error && <Notice tone="error">{error}</Notice>}
          </form>
        </div>
      </div>

      {plan && showFull && (
        <div className="cupi-plan-in">
          <PlanCard
            plan={plan}
            footer={
              <div className="space-y-4">
                {plan.questions.length > 0 && (
                  <fieldset>
                    <legend className="text-[13.5px] font-semibold text-ink">Cupi would ask. All optional; blanks are marked, never guessed.</legend>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {plan.questions.map((q) => (
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
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-[14px] text-ink">Sign up to run this with 100 free credits. Your goal and answers come with you.</span>
                  <LinkButton href={signupHref(goal, answers)}>Create my account</LinkButton>
                </div>
              </div>
            }
          />
        </div>
      )}
    </div>
  );
}

function signupHref(goal: string, answers: Record<string, string>): string {
  const q = new URLSearchParams({ goal });
  const a = cleanAnswers(answers);
  if (a) q.set("answers", JSON.stringify(a));
  return `/signup?${q.toString()}`;
}

/** Typewriter placeholder that cycles through examples until the person starts typing. */
function useTypedPlaceholder(examples: string[], paused: boolean): string {
  const [text, setText] = useState(phrase(examples[0]!));
  const reduced = useRef(false);
  useEffect(() => {
    reduced.current = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);
  useEffect(() => {
    if (paused || reduced.current) return;
    let i = 0;
    let pos = 0;
    let deleting = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const full = phrase(examples[i]!);
      if (!deleting) {
        pos += 1;
        setText(full.slice(0, pos));
        if (pos >= full.length) {
          deleting = true;
          timer = setTimeout(tick, 1800);
          return;
        }
        timer = setTimeout(tick, 38);
      } else {
        pos -= 2;
        setText(full.slice(0, Math.max(5, pos)));
        if (pos <= 5) {
          deleting = false;
          i = (i + 1) % examples.length;
          pos = 5;
          timer = setTimeout(tick, 350);
          return;
        }
        timer = setTimeout(tick, 18);
      }
    };
    timer = setTimeout(tick, 900);
    return () => clearTimeout(timer);
  }, [examples, paused]);
  return text;
}
