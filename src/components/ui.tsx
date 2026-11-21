import Image from "next/image";
import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { MISSION_STATUS_LABEL, STEP_STATUS_LABEL } from "@/server/missions/state";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------
type Variant = "primary" | "secondary" | "ghost" | "danger";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] px-4 py-2.5 text-[15px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const buttonVariants: Record<Variant, string> = {
  primary: "bg-coral text-midnight hover:bg-coral-deep hover:text-cream",
  secondary: "bg-midnight text-cream hover:bg-ink",
  ghost: "bg-transparent text-midnight hover:bg-lavender-soft border border-line",
  danger: "bg-rose-soft text-rose-deep hover:bg-rose-deep hover:text-cream",
};

export function Button({ variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={`${buttonBase} ${buttonVariants[variant]} ${className}`} {...props} />;
}

export function LinkButton({ variant = "primary", className = "", href, children }: { variant?: Variant; className?: string; href: string; children: ReactNode }) {
  return (
    <Link href={href} className={`${buttonBase} ${buttonVariants[variant]} ${className}`}>
      {children}
    </Link>
  );
}

export function Field({ label, hint, error, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  const id = props.id ?? props.name;
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 block text-[14px] font-medium text-ink">{label}</span>
      <input
        id={id}
        className="w-full rounded-[var(--radius-control)] border border-line bg-white px-3.5 py-2.5 text-[15px] text-midnight placeholder:text-mute/70 focus:border-lavender"
        {...props}
      />
      {hint && !error && <span className="mt-1 block text-[13px] text-mute">{hint}</span>}
      {error && <span className="mt-1 block text-[13px] text-rose-deep">{error}</span>}
    </label>
  );
}

export function TextArea({ label, hint, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }) {
  const id = props.id ?? props.name;
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 block text-[14px] font-medium text-ink">{label}</span>
      <textarea
        id={id}
        className="w-full resize-y rounded-[var(--radius-control)] border border-line bg-white px-3.5 py-3 text-[16px] leading-relaxed text-midnight placeholder:text-mute/70 focus:border-lavender"
        {...props}
      />
      {hint && <span className="mt-1 block text-[13px] text-mute">{hint}</span>}
    </label>
  );
}

export function Card({ children, className = "", tone = "paper" }: { children: ReactNode; className?: string; tone?: "paper" | "deep" | "night" }) {
  const tones = {
    paper: "bg-white border border-line",
    deep: "bg-cream-deep border border-transparent",
    night: "bg-midnight text-cream border border-transparent",
  };
  return <section className={`rounded-[var(--radius-card)] p-5 sm:p-6 ${tones[tone]} ${className}`}>{children}</section>;
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" | "error" | "ok" }) {
  const tones = {
    info: "bg-lavender-soft text-lavender-deep",
    warn: "bg-amber-soft text-amber-deep",
    error: "bg-rose-soft text-rose-deep",
    ok: "bg-mint text-mint-deep",
  };
  return <div className={`rounded-[var(--radius-control)] px-3.5 py-2.5 text-[14px] leading-relaxed ${tones[tone]}`}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Brand
// ---------------------------------------------------------------------------
export function CupiMark({ size = 40, className = "", priority = false }: { size?: number; className?: string; priority?: boolean }) {
  return <Image src="/assets/cupi-mascot.png" alt="Cupi" width={size} height={size} priority={priority} className={className} />;
}

export function Wordmark({ dark = false }: { dark?: boolean }) {
  return (
    <Link href="/" className={`inline-flex items-center gap-2 text-[18px] font-bold tracking-tight ${dark ? "text-cream" : "text-midnight"}`}>
      <CupiMark size={28} />
      Decupo
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Status language: ready / in progress / needs you / blocked / done / failed
// ---------------------------------------------------------------------------
type Tone = "done" | "active" | "needs_you" | "blocked" | "failed" | "quiet";

const toneClass: Record<Tone, string> = {
  done: "bg-mint text-mint-deep",
  active: "bg-lavender-soft text-lavender-deep",
  needs_you: "bg-coral-soft text-coral-deep",
  blocked: "bg-amber-soft text-amber-deep",
  failed: "bg-rose-soft text-rose-deep",
  quiet: "bg-slate-soft text-mute",
};

export function missionTone(status: string): Tone {
  switch (status) {
    case "completed":
      return "done";
    case "queued":
    case "running":
      return "active";
    case "awaiting_authorization":
    case "awaiting_review":
    case "estimated":
      return "needs_you";
    case "partially_completed":
      return "blocked";
    case "failed":
      return "failed";
    default:
      return "quiet";
  }
}

export function stepTone(status: string): Tone {
  switch (status) {
    case "succeeded":
      return "done";
    case "ready":
    case "running":
      return "active";
    case "awaiting_approval":
      return "needs_you";
    case "blocked":
      return "blocked";
    case "failed":
      return "failed";
    default:
      return "quiet";
  }
}

export function availabilityTone(a: string): Tone {
  return a === "supported" ? "done" : a === "needs_connection" ? "blocked" : a === "needs_approval" ? "needs_you" : "quiet";
}

export const AVAILABILITY_LABEL: Record<string, string> = {
  supported: "Supported",
  needs_connection: "Needs a connection",
  needs_approval: "Needs your approval",
  not_available: "Not yet",
};

export function Pill({ tone, children, pulse = false }: { tone: Tone; children: ReactNode; pulse?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-pill)] px-2.5 py-1 text-[12.5px] font-semibold ${toneClass[tone]}`}>
      {pulse && <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

export function MissionStatusPill({ status }: { status: string }) {
  const label = (MISSION_STATUS_LABEL as Record<string, string>)[status] ?? status;
  return (
    <Pill tone={missionTone(status)} pulse={status === "running"}>
      {label}
    </Pill>
  );
}

export function StepStatusPill({ status }: { status: string }) {
  const label = (STEP_STATUS_LABEL as Record<string, string>)[status] ?? status;
  return (
    <Pill tone={stepTone(status)} pulse={status === "running"}>
      {label}
    </Pill>
  );
}

// ---------------------------------------------------------------------------
// Crew
// ---------------------------------------------------------------------------
const agentColor: Record<string, string> = {
  Cupi: "bg-coral text-midnight",
  Scout: "bg-lavender text-cream",
  Nova: "bg-[#c2558b] text-cream",
  Forge: "bg-midnight text-cream",
  Motion: "bg-[#d98a1e] text-midnight",
  Echo: "bg-mint-deep text-cream",
  Atlas: "bg-[#4b6bd6] text-cream",
  Pulse: "bg-[#2f9fb3] text-cream",
  Vale: "bg-mint text-mint-deep",
};

export function AgentBadge({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const cls = agentColor[name] ?? "bg-slate-soft text-ink";
  const dim = size === "sm" ? "h-6 w-6 text-[11px]" : "h-8 w-8 text-[13px]";
  return (
    <span title={name} className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${dim} ${cls}`}>
      {name === "Cupi" ? <CupiMark size={size === "sm" ? 22 : 30} /> : name.slice(0, 2)}
    </span>
  );
}

export function Crew({ names }: { names: string[] }) {
  return (
    <div className="flex items-center">
      {names.map((n, i) => (
        <span key={n} className={i === 0 ? "" : "-ml-2"}>
          <AgentBadge name={n} />
        </span>
      ))}
      <span className="ml-3 text-[14px] text-mute">{names.join(", ")}</span>
    </div>
  );
}

export function Credits({ n, className = "" }: { n: number; className?: string }) {
  return (
    <span className={`tabular-nums ${className}`}>
      {n.toLocaleString()} {n === 1 ? "credit" : "credits"}
    </span>
  );
}

export function formatTime(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
