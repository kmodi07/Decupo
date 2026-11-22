/**
 * Deterministic visual direction for generated sites.
 *
 * The look is derived from text the user or the brief already gave us, never
 * from a model call, so the same inputs always produce the same site. Sources
 * are consulted in priority order and the winning source is reported so the
 * quality review and the mission log can say where the look came from:
 *
 *   1. the user's answer to "Any colours or a look you have in mind?"
 *   2. the brand brief's "Visual direction" section
 *   3. the tone hint from the plan questions
 *   4. industry words in the goal itself
 *   5. the default (navy and cobalt)
 *
 * An explicit colour (a hex code or a colour word) in any source becomes the
 * accent, and the masthead, footer and highlight are built from the same hue.
 */

export type PaletteId = "navy" | "earth" | "forest" | "playful" | "luxury" | "blush" | "custom";
export type TypeId = "serif" | "sans" | "mono";
export type ShapeId = "soft" | "regular" | "sharp";
export type ThemeSource = "look" | "brief" | "tone" | "goal" | "default";

export type SiteTheme = {
  palette: PaletteId;
  type: TypeId;
  shape: ShapeId;
  source: ThemeSource;
  /** Human sentence for logs and the quality review. */
  description: string;
  colors: {
    brand: string; // masthead background
    brandDeep: string; // footer background
    canvas: string; // page background
    surface: string; // cards
    ink: string;
    muted: string;
    line: string;
    accent: string;
    accentDeep: string;
    highlight: string;
    onBrand: string;
    onBrandMuted: string;
  };
};

export type ThemeSignals = {
  look?: string;
  visual?: string;
  tone?: string;
  goal: string;
  /** What to use when nothing describes a look: the business archetype's defaults. Navy/sans/regular without one. */
  fallback?: { palette: Exclude<PaletteId, "custom">; type: TypeId; shape: ShapeId };
};

const PALETTES: Record<Exclude<PaletteId, "custom">, SiteTheme["colors"] & { label: string }> = {
  navy: {
    label: "navy and cobalt",
    brand: "#0b1f3a",
    brandDeep: "#071527",
    canvas: "#f4f6f8",
    surface: "#ffffff",
    ink: "#121826",
    muted: "#5b6475",
    line: "#dde3ea",
    accent: "#2f5bea",
    accentDeep: "#1e43c4",
    highlight: "#bff3e0",
    onBrand: "#f4f6f8",
    onBrandMuted: "rgba(244, 246, 248, 0.72)",
  },
  earth: {
    label: "warm earth tones",
    brand: "#3a2a22",
    brandDeep: "#271c17",
    canvas: "#f6f1ea",
    surface: "#fffdf9",
    ink: "#241b16",
    muted: "#6d6056",
    line: "#e6ddd2",
    accent: "#b85c38",
    accentDeep: "#96482a",
    highlight: "#f1c27d",
    onBrand: "#f8f3ec",
    onBrandMuted: "rgba(248, 243, 236, 0.72)",
  },
  forest: {
    label: "deep green and moss",
    brand: "#12301f",
    brandDeep: "#0b2015",
    canvas: "#f2f6f1",
    surface: "#ffffff",
    ink: "#13201a",
    muted: "#5a6a60",
    line: "#d9e3da",
    accent: "#2f7a4a",
    accentDeep: "#235f39",
    highlight: "#d9ec9f",
    onBrand: "#f2f7f1",
    onBrandMuted: "rgba(242, 247, 241, 0.72)",
  },
  playful: {
    label: "bold plum and magenta",
    brand: "#2a1b4a",
    brandDeep: "#1c1233",
    canvas: "#faf7ff",
    surface: "#ffffff",
    ink: "#1d1530",
    muted: "#665c7a",
    line: "#e6dff2",
    accent: "#e4397a",
    accentDeep: "#bf2a62",
    highlight: "#ffd166",
    onBrand: "#faf7ff",
    onBrandMuted: "rgba(250, 247, 255, 0.74)",
  },
  luxury: {
    label: "charcoal and gold",
    brand: "#15161a",
    brandDeep: "#0d0e11",
    canvas: "#f7f5f0",
    surface: "#ffffff",
    ink: "#17181c",
    muted: "#66635c",
    line: "#e3ded4",
    accent: "#9c7a2c",
    accentDeep: "#7d6122",
    highlight: "#e9ddc0",
    onBrand: "#f7f5f0",
    onBrandMuted: "rgba(247, 245, 240, 0.7)",
  },
  blush: {
    label: "dusty rose and blush",
    brand: "#5b2c3f",
    brandDeep: "#421f2d",
    canvas: "#fbf5f7",
    surface: "#ffffff",
    ink: "#2a1a21",
    muted: "#74606a",
    line: "#eedbe2",
    accent: "#c84b7a",
    accentDeep: "#a63a63",
    highlight: "#ffe3ec",
    onBrand: "#fbf5f7",
    onBrandMuted: "rgba(251, 245, 247, 0.74)",
  },
};

const PALETTE_WORDS: Array<[PaletteId, RegExp]> = [
  ["earth", /\b(warm|earth(y|-tone)?s?|terracotta|clay|rust|amber|ochre|sand|rustic|natural|organic|handmade|craft|cosy|cozy|wood(en)?)\b/i],
  ["forest", /\b(forest|green|moss|sage|olive|botanic(al)?|garden|plant|eco|sustainab\w*|nature|wellness|calm|fresh|herbal)\b/i],
  ["playful", /\b(bold|playful|fun|vibrant|bright|energetic|colou?rful|kids?|children|party|neon|pop|magenta|purple|violet)\b/i],
  ["luxury", /\b(luxur\w*|premium|elegant|gold(en)?|black|charcoal|monochrome|minimal(ist)?|fashion|couture|refined|timeless|classic)\b/i],
  ["blush", /\b(pastel|soft|gentle|feminine|blush|rose|pink|wedding|bridal|beauty|floral|delicate|romantic)\b/i],
  ["navy", /\b(navy|blue|cobalt|ocean|trust\w*|professional|corporate|tech(nical|nology)?|clean|modern|reliable|finance|legal)\b/i],
];

const GOAL_WORDS: Array<[PaletteId, RegExp]> = [
  ["earth", /\b(pottery|ceramic|bakery|bread|caf[eé]|coffee|roaster|restaurant|bistro|carpent\w*|woodwork\w*|farm|vineyard|winery|brewery|leather)\b/i],
  ["forest", /\b(garden\w*|landscap\w*|yoga|spa|wellness|nursery|florist|organic|outdoor|hiking|camp\w*|vet\w*|environment\w*)\b/i],
  ["playful", /\b(kids?|children|toy|games?|party|playground|tutor\w*|school|camp|comic|arcade|candy|ice ?cream)\b/i],
  ["luxury", /\b(jewel\w*|fashion|boutique|salon|watch\w*|luxury|interior|architect\w*|gallery|hotel|fine dining|private)\b/i],
  ["blush", /\b(wedding|bridal|beauty|makeup|nail|florist|bakery cake|cake|boudoir|skincare)\b/i],
  ["navy", /\b(law|legal|account\w*|finance|financial|consult\w*|engineering|software|saas|startup|clinic|dental|insurance|logistics|agency)\b/i],
];

const COLOR_WORDS: Array<[RegExp, string]> = [
  [/\bnavy\b/i, "#1b3a7a"],
  [/\bteal\b/i, "#0f8b8d"],
  [/\bturquoise|aqua|cyan\b/i, "#1aa6b7"],
  [/\bsky blue|light blue\b/i, "#3a8dde"],
  [/\bblue\b/i, "#2f5bea"],
  [/\bemerald|green\b/i, "#2f7a4a"],
  [/\bmint\b/i, "#3cb489"],
  [/\bolive\b/i, "#6b7a2a"],
  [/\bmustard|yellow\b/i, "#d4a017"],
  [/\bgold(en)?\b/i, "#9c7a2c"],
  [/\borange\b/i, "#e3702a"],
  [/\bcoral\b/i, "#e8604c"],
  [/\bterracotta|rust\b/i, "#b85c38"],
  [/\bred|crimson|scarlet\b/i, "#c62f3b"],
  [/\bburgundy|maroon|wine\b/i, "#7a1f33"],
  [/\bpink|rose|blush\b/i, "#c84b7a"],
  [/\bmagenta|fuchsia\b/i, "#e4397a"],
  [/\bpurple|violet|lavender|plum\b/i, "#6b3fd6"],
  [/\bbrown|chocolate|espresso\b/i, "#6b4a2b"],
];

// Most specific cue first: an explicit "serif" or "luxury" outranks a generic "clean" or "minimal".
const TYPE_WORDS: Array<[TypeId, RegExp]> = [
  ["mono", /\b(mono(space)?|technical|developer|engineering|code|terminal|industrial|brutalist)\b/i],
  ["serif", /\b((?<!sans-)serif|editorial|classic|elegant|luxur\w*|traditional|heritage|literary|timeless|refined|artisan\w*|craft)\b/i],
  ["sans", /\b(modern|clean|minimal(ist)?|geometric|sans|tech|startup|saas|bold|playful|friendly|contemporary|sleek)\b/i],
];

const SHAPE_WORDS: Array<[ShapeId, RegExp]> = [
  ["sharp", /\b(sharp|minimal(ist)?|editorial|architectural|square|brutalist|precise|geometric|crisp)\b/i],
  ["soft", /\b(soft|rounded|friendly|playful|gentle|cosy|cozy|warm|bubbly|kids?|children)\b/i],
];

export function deriveTheme(signals: ThemeSignals): SiteTheme {
  const ordered: Array<[ThemeSource, string | undefined]> = [
    ["look", signals.look],
    ["brief", signals.visual],
    ["tone", signals.tone],
  ];

  let palette: PaletteId | null = null;
  let customAccent: string | null = null;
  let source: ThemeSource = "default";
  for (const [src, text] of ordered) {
    const t = text?.trim();
    if (!t) continue;
    const hex = /#([0-9a-f]{6}|[0-9a-f]{3})\b/i.exec(t)?.[0];
    if (hex) {
      customAccent = normaliseHex(hex);
      palette = "custom";
      source = src;
      break;
    }
    const word = COLOR_WORDS.find(([re]) => re.test(t));
    const mood = PALETTE_WORDS.find(([, re]) => re.test(t));
    if (word && (!mood || !isMoodDominant(t, mood[1]))) {
      customAccent = word[1];
      palette = "custom";
      source = src;
      break;
    }
    if (mood) {
      palette = mood[0];
      source = src;
      break;
    }
  }
  if (!palette) {
    const fromGoal = GOAL_WORDS.find(([, re]) => re.test(signals.goal));
    if (signals.fallback) {
      // The archetype knows the business better than a stray colour word in the goal.
      palette = signals.fallback.palette;
      source = "goal";
    } else if (fromGoal) {
      palette = fromGoal[0];
      source = "goal";
    } else {
      palette = "navy";
      source = "default";
    }
  }

  // Type and shape read all sources, since a single sentence may set all three.
  const all = [signals.look, signals.visual, signals.tone].filter(Boolean).join(" ");
  const type = TYPE_WORDS.find(([, re]) => re.test(all))?.[0] ?? signals.fallback?.type ?? defaultTypeFor(palette);
  const shape = SHAPE_WORDS.find(([, re]) => re.test(all))?.[0] ?? signals.fallback?.shape ?? defaultShapeFor(palette);

  const colors = palette === "custom" ? customPalette(customAccent!) : stripLabel(PALETTES[palette]);
  const paletteLabel = palette === "custom" ? `a custom palette built from ${customAccent}` : PALETTES[palette].label;
  const typeLabel = type === "serif" ? "a serif display face" : type === "mono" ? "a monospace display face" : "a sans-serif display face";
  const shapeLabel = shape === "sharp" ? "sharp corners" : shape === "soft" ? "soft, rounded corners" : "gently rounded corners";
  const sourceLabel: Record<ThemeSource, string> = {
    look: "your answer about the look",
    brief: "the brand brief's visual direction",
    tone: "the tone you asked for",
    goal: "the kind of business in the goal",
    default: "the default, because nothing in the brief or answers described a look",
  };
  return {
    palette,
    type,
    shape,
    source,
    description: `Look: ${paletteLabel}, ${typeLabel}, ${shapeLabel}. Chosen from ${sourceLabel[source]}.`,
    colors,
  };
}

function isMoodDominant(text: string, moodRe: RegExp): boolean {
  // "warm orange" -> the colour word should win; "warm and natural" -> the mood wins.
  const colourHits = COLOR_WORDS.filter(([re]) => re.test(text)).length;
  const moodHits = (text.match(new RegExp(moodRe.source, "gi")) ?? []).length;
  return moodHits > colourHits;
}

function defaultTypeFor(p: PaletteId): TypeId {
  return p === "playful" ? "sans" : p === "navy" ? "sans" : "serif";
}

function defaultShapeFor(p: PaletteId): ShapeId {
  return p === "playful" || p === "blush" ? "soft" : p === "luxury" ? "sharp" : "regular";
}

function stripLabel(p: SiteTheme["colors"] & { label: string }): SiteTheme["colors"] {
  const { label, ...colors } = p;
  void label;
  return colors;
}

// ---------------------------------------------------------------------------
// Colour utilities (sRGB <-> HSL), enough to build a palette from one accent.
// ---------------------------------------------------------------------------
export function normaliseHex(hex: string): string {
  let h = hex.replace("#", "").toLowerCase();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return `#${h}`;
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const n = parseInt(normaliseHex(hex).slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s, l };
}

export function hslToHex(h: number, s: number, l: number): string {
  const hue = (((h % 360) + 360) % 360) / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  const toHex = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0");
  return `#${toHex(s === 0 ? l : f(hue + 1 / 3))}${toHex(s === 0 ? l : f(hue))}${toHex(s === 0 ? l : f(hue - 1 / 3))}`;
}

/** Relative luminance (WCAG) of a hex colour. */
export function luminance(hex: string): number {
  const n = parseInt(normaliseHex(hex).slice(1), 16);
  const ch = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Build a full palette around one accent so white text on the accent and light text on the masthead stay readable. */
export function customPalette(accentHex: string): SiteTheme["colors"] {
  const { h, s } = hexToHsl(accentHex);
  const sat = Math.min(0.9, Math.max(0.35, s || 0.5));
  // Darken the accent until white text reaches 4.5:1 on it.
  let accentL = hexToHsl(accentHex).l;
  let accent = hslToHex(h, sat, accentL);
  while (contrastRatio(accent, "#ffffff") < 4.5 && accentL > 0.12) {
    accentL -= 0.02;
    accent = hslToHex(h, sat, accentL);
  }
  const accentDeep = hslToHex(h, sat, Math.max(0.1, accentL - 0.1));
  const brand = hslToHex(h, Math.min(0.6, sat), 0.13);
  const brandDeep = hslToHex(h, Math.min(0.6, sat), 0.08);
  const canvas = hslToHex(h, 0.25, 0.97);
  const line = hslToHex(h, 0.2, 0.88);
  const ink = hslToHex(h, 0.3, 0.1);
  const muted = hslToHex(h, 0.12, 0.42);
  const highlight = hslToHex((h + 40) % 360, 0.75, 0.84);
  const onBrand = hslToHex(h, 0.25, 0.97);
  return {
    brand,
    brandDeep,
    canvas,
    surface: "#ffffff",
    ink,
    muted,
    line,
    accent,
    accentDeep,
    highlight,
    onBrand,
    onBrandMuted: `color-mix(in srgb, ${onBrand} 72%, transparent)`,
  };
}

export const TYPE_STACKS: Record<TypeId, string> = {
  serif: '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
  sans: 'system-ui, -apple-system, "Segoe UI Variable Display", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  mono: 'ui-monospace, "Cascadia Code", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
};

export const SHAPE_RADII: Record<ShapeId, { l: string; m: string; s: string; pill: string }> = {
  soft: { l: "28px", m: "20px", s: "14px", pill: "999px" },
  regular: { l: "22px", m: "14px", s: "10px", pill: "999px" },
  sharp: { l: "6px", m: "4px", s: "3px", pill: "6px" },
};
