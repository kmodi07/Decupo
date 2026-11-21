/**
 * Cupi as a living character: an original SVG built from the mascot's
 * ingredients (ivory shell, midnight-violet visor, coral chest spark, lavender
 * antennae, rounded hands). The `mood` drives CSS-only animation defined in
 * globals.css under `.cupi`:
 *
 *   idle       slow float, occasional blink, gentle antenna sway
 *   listening  leans in and perks up while the person types
 *   thinking   eyes drift up, spark pulses, antennae flicker while planning
 *   happy      waves and bounces once when the plan is ready
 *
 * Everything is decorative; the bubble next to Cupi carries the words.
 */
export type CupiMood = "idle" | "listening" | "thinking" | "happy";

export function CupiAvatar({ mood = "idle", size = 320, className = "" }: { mood?: CupiMood; size?: number; className?: string }) {
  return (
    <svg
      className={`cupi ${className}`}
      data-mood={mood}
      width={size}
      height={size * 1.05}
      viewBox="0 0 240 252"
      fill="none"
      role="img"
      aria-label={`Cupi, ${MOOD_LABEL[mood]}`}
    >
      <defs>
        <linearGradient id="cupi-shell" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fffaf2" />
          <stop offset="1" stopColor="#f1e6d6" />
        </linearGradient>
        <linearGradient id="cupi-visor" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2e2a52" />
          <stop offset="1" stopColor="#141329" />
        </linearGradient>
        <linearGradient id="cupi-antenna" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b7a6f5" />
          <stop offset="1" stopColor="#8065ed" />
        </linearGradient>
        <radialGradient id="cupi-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fc805d" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fc805d" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* ground shadow */}
      <ellipse className="cupi-shadow" cx="120" cy="240" rx="54" ry="8" fill="#141329" opacity="0.12" />

      <g className="cupi-body">
        {/* antennae */}
        <g className="cupi-antenna cupi-antenna-left">
          <path d="M66 70c-14-16-34-22-40-14s6 28 24 36c6 3 12 0 16-6s4-12 0-16Z" fill="url(#cupi-antenna)" />
          <path d="M44 62c6 2 14 8 20 16" stroke="#ffd7b8" strokeWidth="3" strokeLinecap="round" opacity="0.9" />
        </g>
        <g className="cupi-antenna cupi-antenna-right">
          <path d="M174 70c14-16 34-22 40-14s-6 28-24 36c-6 3-12 0-16-6s-4-12 0-16Z" fill="url(#cupi-antenna)" />
          <path d="M196 62c-6 2-14 8-20 16" stroke="#ffd7b8" strokeWidth="3" strokeLinecap="round" opacity="0.9" />
        </g>

        {/* arms */}
        <g className="cupi-arm cupi-arm-left">
          <path d="M62 150c-14 10-30 26-36 38" stroke="#f1e6d6" strokeWidth="18" strokeLinecap="round" />
          <circle cx="24" cy="190" r="13" fill="#fffaf2" />
          <path d="M44 166c-6 6-10 12-12 18" stroke="#b7a6f5" strokeWidth="10" strokeLinecap="round" />
        </g>
        <g className="cupi-arm cupi-arm-right">
          <path d="M178 150c16 4 34 0 44-12" stroke="#f1e6d6" strokeWidth="18" strokeLinecap="round" />
          <path d="M206 146c6-2 12-6 16-10" stroke="#b7a6f5" strokeWidth="10" strokeLinecap="round" />
          <g className="cupi-hand">
            <circle cx="226" cy="132" r="13" fill="#fffaf2" />
            <path d="M222 120v-10M229 120v-12M235 124v-9" stroke="#fffaf2" strokeWidth="6" strokeLinecap="round" />
          </g>
        </g>

        {/* torso */}
        <path d="M70 150c0-22 22-36 50-36s50 14 50 36v40c0 22-22 36-50 36s-50-14-50-36v-40Z" fill="url(#cupi-shell)" />
        <circle className="cupi-spark-glow" cx="120" cy="182" r="30" fill="url(#cupi-glow)" />
        <path className="cupi-spark" d="M120 164l6 14 14 6-14 6-6 14-6-14-14-6 14-6 6-14Z" fill="#fc805d" />

        {/* legs */}
        <path d="M96 222c-6 8-10 14-10 20" stroke="#f1e6d6" strokeWidth="16" strokeLinecap="round" />
        <path d="M144 222c6 8 10 14 10 20" stroke="#f1e6d6" strokeWidth="16" strokeLinecap="round" />
        <ellipse cx="84" cy="243" rx="12" ry="6" fill="#b7a6f5" />
        <ellipse cx="156" cy="243" rx="12" ry="6" fill="#b7a6f5" />

        {/* head */}
        <g className="cupi-head">
          <ellipse cx="120" cy="92" rx="74" ry="60" fill="url(#cupi-shell)" />
          <path d="M70 58c14-10 30-14 50-14s36 4 50 14" stroke="#ffd7b8" strokeWidth="3" strokeLinecap="round" opacity="0.9" />
          <rect x="60" y="62" width="120" height="68" rx="34" fill="url(#cupi-visor)" />
          <path d="M80 72c8-6 20-10 40-10" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" opacity="0.18" />

          {/* eyes */}
          <g className="cupi-eyes">
            <g className="cupi-eye">
              <circle cx="96" cy="98" r="13" fill="#ffffff" />
              <circle className="cupi-pupil" cx="98" cy="100" r="8" fill="#141329" />
              <circle className="cupi-pupil-shine" cx="101" cy="96" r="3" fill="#ffffff" />
            </g>
            <g className="cupi-eye">
              <circle cx="144" cy="98" r="13" fill="#ffffff" />
              <circle className="cupi-pupil" cx="146" cy="100" r="8" fill="#141329" />
              <circle className="cupi-pupil-shine" cx="149" cy="96" r="3" fill="#ffffff" />
            </g>
          </g>
          {/* lids for blinking: scale from the eye centre line */}
          <g className="cupi-lids">
            <rect x="82" y="84" width="28" height="30" rx="14" fill="#1f1c3a" />
            <rect x="130" y="84" width="28" height="30" rx="14" fill="#1f1c3a" />
          </g>

          {/* blush and mouth */}
          <rect x="74" y="110" width="12" height="4" rx="2" fill="#fc805d" opacity="0.7" />
          <rect x="154" y="110" width="12" height="4" rx="2" fill="#fc805d" opacity="0.7" />
          <path className="cupi-mouth cupi-mouth-smile" d="M110 112c4 6 16 6 20 0" stroke="#fc805d" strokeWidth="3.5" strokeLinecap="round" />
          <path className="cupi-mouth cupi-mouth-open" d="M109 110c4 10 18 10 22 0c-6 3-16 3-22 0Z" fill="#fc805d" />
          <path className="cupi-mouth cupi-mouth-o" d="M114 112a6 5 0 1 0 12 0a6 5 0 1 0-12 0Z" fill="#fc805d" />
        </g>
      </g>
    </svg>
  );
}

const MOOD_LABEL: Record<CupiMood, string> = {
  idle: "waiting for your goal",
  listening: "listening",
  thinking: "planning",
  happy: "happy with the plan",
};
