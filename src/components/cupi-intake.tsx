"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import { api, errorMessage } from "@/lib/api";
import { cleanAnswers, readOfPlan } from "@/lib/plan-read";
import type { MissionPlan } from "@/server/planner/types";
import { AgentCursor, type CursorMode } from "./agent-cursor";
import { CupiAvatar, type CupiMood } from "./cupi-avatar";
import { PlanCard } from "./plan-card";
import { LinkButton, Notice } from "./ui";

const PLAN_TOUR = ['[data-cupi="plan-title"]', '[data-cupi="step"]:nth-of-type(1)', '[data-cupi="step"]:nth-of-type(2)', '[data-cupi="step"]:nth-of-type(3)', '[data-cupi="estimate"]', '[data-cupi="cta"]'];

export const EXAMPLES = [
  "Help Sri Ganesh Agency in Bharuch sell more LG fridges and TVs this season",
  "Find buyers in Delhi for 500 kg of ashwagandha root at Rs 450 per kg",
  "Make a website for my tutoring company",
  "Post a week of Instagram reels for my electronics shop in Bharuch",
  "Research the market for pet subscription boxes",
];

/**
 * The front door, kept as simple as a search box: Cupi, one sentence, one
 * arrow. The plan appears below only after the person presses send, with at
 * most three optional questions, then a single button to create the account.
 * Nothing is saved until they sign up; the preview endpoint is public and
 * rule-based.
 */
export function CupiIntake() {
  const params = useSearchParams();
  const [goal, setGoal] = useState(() => params.get("goal") ?? "");
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<MissionPlan | null>(null);
  const [planFor, setPlanFor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [toured, setToured] = useState(false);
  const placeholder = useTypedPlaceholder(EXAMPLES, focused || goal.length > 0);
  const planRef = useRef<HTMLDivElement | null>(null);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const trimmed = goal.trim();
    if (trimmed.length < 8 || busy) return;
    if (plan && planFor === trimmed) {
      planRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ plan: MissionPlan }>("/api/plan/preview", { json: { goal: trimmed } });
      setPlan(res.plan);
      setPlanFor(trimmed);
      setAnswers({});
      setToured(false);
      setCelebrate(true);
      setTimeout(() => setCelebrate(false), 2200);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (plan) planRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [plan]);

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  const mood: CupiMood = busy ? "thinking" : celebrate ? "happy" : focused ? "listening" : "idle";
  const ready = goal.trim().length >= 8;
  // Cupi's cursor: reads along while typing, circles the arrow while planning, then walks the plan.
  const cursorMode: CursorMode = busy ? "think" : plan && planFor === goal.trim() ? (toured ? "rest" : "tour") : "watch";

  return (
    <div className="space-y-10">
      <AgentCursor mode={cursorMode} anchor=".cupi-box" tour={PLAN_TOUR} typing={goal.length} onTourEnd={() => setToured(true)} />
      <div className="mx-auto flex max-w-[760px] flex-col items-center">
        <div className="cupi-stage relative mb-2 w-[150px]">
          <div className="cupi-orb cupi-orb-a" aria-hidden />
          <div className="cupi-orb cupi-orb-b" aria-hidden />
          <CupiAvatar mood={mood} size={150} className="relative block w-full" />
        </div>
        <h1 className="text-center text-[38px] font-bold leading-[1.04] tracking-[-0.03em] sm:text-[58px]">Say the dream. Watch it happen.</h1>
        <p className="mt-4 max-w-[46ch] text-center text-[17px] leading-relaxed text-ink sm:text-[19px]">Meet Cupi, the crew lead who turns one sentence into finished work.</p>

        <form onSubmit={submit} className="cupi-box mt-8 w-full">
          <label className="block">
            <span className="sr-only">Tell Cupi the goal</span>
            <textarea
              name="goal"
              rows={2}
              required
              minLength={8}
              maxLength={500}
              placeholder={placeholder}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              onKeyDown={onKey}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              className="cupi-input w-full resize-none bg-transparent px-6 pb-14 pt-5 text-[19px] leading-relaxed text-midnight outline-none placeholder:text-mute/55 sm:text-[21px]"
            />
          </label>
          <button type="submit" className="cupi-send" disabled={!ready || busy} aria-label={busy ? "Cupi is planning" : "Show me the plan"} title="Show me the plan">
            {busy ? (
              <span className="cupi-send-dots" aria-hidden>
                <i />
                <i />
                <i />
              </span>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            )}
          </button>
        </form>
        <p className="mt-3 text-center text-[13.5px] text-mute">{plan ? readOfPlan(plan) : "Free to start. Nothing runs until you approve the plan and the price."}</p>
        {error && (
          <div className="mt-3 w-full">
            <Notice tone="error">{error}</Notice>
          </div>
        )}
      </div>

      {plan && (
        <div ref={planRef} className="cupi-plan-in scroll-mt-24">
          <PlanCard
            plan={plan}
            footer={
              <div className="space-y-4">
                {plan.questions.length > 0 && (
                  <fieldset>
                    <legend className="text-[13.5px] font-semibold text-ink">
                      {plan.questions.length === 1 ? "One optional question." : `${plan.questions.length} optional questions.`} Blanks are marked, never guessed.
                    </legend>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {plan.questions.map((q) => (
                        <label key={q.key} className="block">
                          <span className="mb-1 block text-[13px] text-mute">{q.prompt}</span>
                          <input
                            name={`answer-${q.key}`}
                            aria-label={q.prompt}
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
                  <span className="text-[14px] text-ink">Sign up to run this with 500 free credits. Your goal and answers come with you.</span>
                  <span data-cupi="cta">
                    <LinkButton href={signupHref(goal, answers)}>Create my account</LinkButton>
                  </span>
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
  const [text, setText] = useState(examples[0]!);
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
      const full = examples[i]!;
      if (!deleting) {
        pos += 1;
        setText(full.slice(0, pos));
        if (pos >= full.length) {
          deleting = true;
          timer = setTimeout(tick, 2200);
          return;
        }
        timer = setTimeout(tick, 34);
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
        timer = setTimeout(tick, 16);
      }
    };
    timer = setTimeout(tick, 900);
    return () => clearTimeout(timer);
  }, [examples, paused]);
  return text;
}
