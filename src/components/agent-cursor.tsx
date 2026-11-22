"use client";

import { useEffect, useRef } from "react";

export type CursorMode =
  /** Hovering around the box the person is typing in, as if reading along. */
  | "watch"
  /** Circling the send control while the plan is being worked out. */
  | "think"
  /** Visiting each element in `tour`, in order, then resting on the last one. */
  | "tour"
  /** Sitting at the current `tour` target with a slow breathing drift. */
  | "rest"
  | "hidden";

type Props = {
  mode: CursorMode;
  /** CSS selector of the box to watch (and the send button inside it, if any). */
  anchor: string;
  /** Selectors to visit during a tour; the last one is where the cursor rests. */
  tour?: string[];
  /** Any changing number (for example the text length) nudges the cursor toward the end of the text. */
  typing?: number;
  /** Called once a tour has visited every target. */
  onTourEnd?: () => void;
  label?: string;
};

type Pt = { x: number; y: number };

/**
 * Cupi's cursor: a small lavender arrow with a name tag that moves on its own.
 * It makes the crew's attention visible: it hovers around the box while the
 * person types, circles the send button while the plan is being made, then
 * walks down the plan step by step. Purely decorative: it never captures
 * pointer events, it is hidden from assistive technology, and under
 * prefers-reduced-motion it simply sits beside the box.
 */
export function AgentCursor({ mode, anchor, tour = [], typing = 0, onTourEnd, label = "Cupi" }: Props) {
  const el = useRef<HTMLDivElement | null>(null);
  const pos = useRef<Pt | null>(null);
  const nudge = useRef(0);
  const tourIndex = useRef(0);
  const tourSince = useRef(0);
  const reduced = useRef(false);
  const onEnd = useRef(onTourEnd);
  const tourRef = useRef(tour);
  // Parents pass a fresh array each render; only a change in the targets themselves restarts the loop.
  const tourKey = tour.join("|");

  useEffect(() => {
    onEnd.current = onTourEnd;
  }, [onTourEnd]);
  useEffect(() => {
    tourRef.current = tour;
  }, [tour]);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // A keystroke sends the cursor toward the end of the text for a moment.
  useEffect(() => {
    nudge.current = performance.now();
  }, [typing]);

  useEffect(() => {
    tourIndex.current = 0;
    tourSince.current = performance.now();
  }, [mode, tourKey]);

  useEffect(() => {
    if (mode === "hidden") return;
    let raf = 0;
    let ended = false;
    const tick = (t: number) => {
      const node = el.current;
      const box = document.querySelector<HTMLElement>(anchor);
      if (!node || !box) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const r = box.getBoundingClientRect();
      const send = box.querySelector<HTMLElement>("button[type=submit]")?.getBoundingClientRect() ?? null;
      let target: Pt;
      let tilt = 0;
      if (mode === "watch") {
        // Drift in a slow figure of eight over the right half of the box, as if scanning the line.
        const a = t / 1000;
        target = { x: r.left + r.width * (0.56 + 0.3 * Math.sin(a * 0.9)), y: r.top + r.height * (0.4 + 0.22 * Math.sin(a * 1.8)) };
        const sinceKey = t - nudge.current;
        if (sinceKey < 900) {
          // Follow the typing: jump toward the text's trailing edge, then ease back.
          const k = 1 - sinceKey / 900;
          const textEnd = caretGuess(box) ?? { x: r.left + r.width * 0.5, y: r.top + 34 };
          target = { x: target.x + (textEnd.x + 18 - target.x) * k, y: target.y + (textEnd.y + 10 - target.y) * k };
        }
      } else if (mode === "think") {
        // Tight orbit around the send button.
        const c = send ? { x: send.left + send.width / 2, y: send.top + send.height / 2 } : { x: r.right - 36, y: r.bottom - 36 };
        const a = t / 260;
        target = { x: c.x + 30 * Math.cos(a), y: c.y + 22 * Math.sin(a) };
        tilt = -12 + 8 * Math.sin(a);
      } else {
        // Tour: pause on each target in turn, then rest on the last one.
        const tour = tourRef.current;
        const idx = Math.min(tourIndex.current, Math.max(tour.length - 1, 0));
        const sel = tour[idx];
        const tgt = sel ? document.querySelector<HTMLElement>(sel) : null;
        const tr = tgt?.getBoundingClientRect();
        if (tr) {
          const breathe = mode === "rest" ? 3 * Math.sin(t / 700) : 0;
          target = { x: tr.left + Math.min(28, tr.width * 0.2), y: tr.top + tr.height * 0.5 + breathe };
        } else {
          target = { x: r.right - 40, y: r.bottom + 24 };
        }
        if (mode === "tour" && t - tourSince.current > 850) {
          tourSince.current = t;
          if (tourIndex.current < tour.length - 1) tourIndex.current += 1;
          else if (!ended) {
            ended = true;
            onEnd.current?.();
          }
        }
      }
      // Keep it on screen.
      target.x = Math.max(12, Math.min(window.innerWidth - 40, target.x));
      target.y = Math.max(12, Math.min(window.innerHeight - 40, target.y));
      if (!pos.current || reduced.current) pos.current = target;
      else {
        const ease = mode === "think" ? 0.18 : 0.08;
        pos.current = { x: pos.current.x + (target.x - pos.current.x) * ease, y: pos.current.y + (target.y - pos.current.y) * ease };
      }
      node.style.transform = `translate3d(${pos.current.x.toFixed(1)}px, ${pos.current.y.toFixed(1)}px, 0) rotate(${tilt.toFixed(1)}deg)`;
      node.classList.add("is-visible");
      if (!reduced.current || mode === "tour") raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mode, anchor, tourKey]);

  if (mode === "hidden") return null;
  return (
    <div ref={el} className={`agent-cursor${mode === "think" ? " is-thinking" : ""}`} aria-hidden="true">
      <svg width="22" height="26" viewBox="0 0 22 26" fill="none">
        <path d="M2 2l6.2 20 3.3-7.4L19 11.6 2 2Z" fill="var(--color-lavender)" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
      <span className="agent-cursor-tag">{label}</span>
    </div>
  );
}

/** Rough position of the end of the text in a textarea or input, using a mirror span. */
function caretGuess(box: HTMLElement): Pt | null {
  const field = box.querySelector<HTMLTextAreaElement | HTMLInputElement>("textarea, input[type=text]");
  if (!field) return null;
  const rect = field.getBoundingClientRect();
  const cs = getComputedStyle(field);
  const mirror = document.createElement("div");
  mirror.style.cssText = `position:fixed;left:-9999px;top:0;visibility:hidden;white-space:pre-wrap;word-wrap:break-word;width:${field.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)}px;font:${cs.font};letter-spacing:${cs.letterSpacing};line-height:${cs.lineHeight};`;
  mirror.textContent = field.value;
  const marker = document.createElement("span");
  marker.textContent = "​";
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const m = marker.getBoundingClientRect();
  const base = mirror.getBoundingClientRect();
  document.body.removeChild(mirror);
  return { x: rect.left + parseFloat(cs.paddingLeft) + (m.left - base.left), y: rect.top + parseFloat(cs.paddingTop) + (m.top - base.top) - field.scrollTop };
}
