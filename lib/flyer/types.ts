// Block-based flyer document model ("v2"). A flyer is a single US Letter page
// described as absolutely-positioned blocks in PAGE POINTS (72pt = 1in).
// The same document renders in the editor canvas (scaled) and in the print
// pipeline (true size → headless Chrome → PDF), so what you see is what prints.

import type { FlyerConfig, SurveyQuestion } from "@/lib/types";

// ---------------------------------------------------------------------------
// Page geometry (US Letter, points)
// ---------------------------------------------------------------------------

export const PAGE_W = 612;
export const PAGE_H = 792;
/** Keep-clear margin for office printers (0.25in). Guides only — not enforced. */
export const SAFE_MARGIN = 18;

// ---------------------------------------------------------------------------
// Fonts — a curated set of Google Fonts loaded in both editor and print HTML.
// ---------------------------------------------------------------------------

export type FlyerFontKey =
  | "inter"
  | "poppins"
  | "nunito"
  | "playfair"
  | "lora"
  | "caveat";

export const FLYER_FONTS: Record<
  FlyerFontKey,
  { label: string; family: string; google: string }
> = {
  inter: {
    label: "Inter (clean)",
    family: "'Inter', 'Helvetica Neue', Arial, sans-serif",
    google: "Inter:wght@400;600;700",
  },
  poppins: {
    label: "Poppins (friendly)",
    family: "'Poppins', 'Helvetica Neue', Arial, sans-serif",
    google: "Poppins:wght@400;600;700",
  },
  nunito: {
    label: "Nunito (rounded)",
    family: "'Nunito', 'Helvetica Neue', Arial, sans-serif",
    google: "Nunito:wght@400;700;800",
  },
  playfair: {
    label: "Playfair Display (elegant)",
    family: "'Playfair Display', Georgia, serif",
    google: "Playfair+Display:wght@400;600;700",
  },
  lora: {
    label: "Lora (warm serif)",
    family: "'Lora', Georgia, serif",
    google: "Lora:wght@400;600;700",
  },
  caveat: {
    label: "Caveat (handwritten)",
    family: "'Caveat', cursive",
    google: "Caveat:wght@400;600;700",
  },
};

/** Google Fonts stylesheet URL covering the given font keys. */
export function googleFontsUrl(keys: FlyerFontKey[]): string {
  const unique = [...new Set(keys.length ? keys : (["inter"] as FlyerFontKey[]))];
  const families = unique
    .map((k) => `family=${FLYER_FONTS[k].google}`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}

// ---------------------------------------------------------------------------
// Merge tokens — resolved per recipient at render time.
// ---------------------------------------------------------------------------

export const MERGE_TOKENS = [
  { token: "{{first_name}}", label: "First name" },
  { token: "{{full_name}}", label: "Full name" },
  { token: "{{practice_name}}", label: "Practice name" },
  { token: "{{credit}}", label: "Credit amount" },
  { token: "{{survey_url}}", label: "Survey link" },
] as const;

export interface FlyerRenderData {
  firstName: string;
  fullName: string;
  practiceName: string;
  /** e.g. "$50" */
  creditLabel: string;
  /** Display form, no protocol — e.g. "southernsmiles.com/survey/AB12" */
  surveyUrl: string;
  /** Data URL of this recipient's unique QR code. */
  qrDataUrl: string;
}

export function resolveTokens(text: string, data: FlyerRenderData): string {
  return (text ?? "")
    .replaceAll("{{first_name}}", data.firstName)
    .replaceAll("{{full_name}}", data.fullName)
    .replaceAll("{{practice_name}}", data.practiceName)
    .replaceAll("{{credit}}", data.creditLabel)
    .replaceAll("{{survey_url}}", data.surveyUrl);
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

export interface FlyerBlockBase {
  id: string;
  /** Position + size in page points. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Degrees, clockwise. */
  rotation: number;
  /** Stacking order — higher renders on top. */
  z: number;
}

export type FlyerTextAlign = "left" | "center" | "right";

/** Marks the text blocks the Simple editing mode maps its form fields onto. */
export type FlyerTextRole = "heading" | "body" | "signature";

export interface FlyerTextBlock extends FlyerBlockBase {
  type: "text";
  /** Plain text. Supports merge tokens and newlines. */
  text: string;
  role?: FlyerTextRole;
  font: FlyerFontKey;
  fontSize: number;
  bold: boolean;
  color: string;
  align: FlyerTextAlign;
  lineHeight: number;
  /** "transparent" or hex. */
  backgroundColor: string;
  padding: number;
  borderRadius: number;
}

export type FlyerImageFit = "cover" | "contain";

export interface FlyerImageBlock extends FlyerBlockBase {
  type: "image";
  url: string | null;
  /** Set when AI designs the flyer; the server fills `url` from this. */
  aiPrompt?: string;
  fit: FlyerImageFit;
  borderRadius: number;
  opacity: number;
  /** Source pixel dimensions, when known — used for print-DPI warnings. */
  naturalWidth?: number;
  naturalHeight?: number;
}

export type FlyerShapeKind =
  | "rect"
  | "circle"
  | "blob1"
  | "blob2"
  | "wave"
  | "tooth"
  | "sparkle"
  | "heart";

export const FLYER_SHAPES: { kind: FlyerShapeKind; label: string }[] = [
  { kind: "rect", label: "Rectangle" },
  { kind: "circle", label: "Circle" },
  { kind: "blob1", label: "Blob" },
  { kind: "blob2", label: "Blob 2" },
  { kind: "wave", label: "Wave" },
  { kind: "tooth", label: "Tooth" },
  { kind: "sparkle", label: "Sparkle" },
  { kind: "heart", label: "Heart" },
];

export interface FlyerShapeBlock extends FlyerBlockBase {
  type: "shape";
  shape: FlyerShapeKind;
  color: string;
  opacity: number;
  borderRadius: number;
}

/** Required block — every flyer must keep exactly one (it carries the unique
 *  per-patient QR code). Movable and restylable, but not deletable. */
export interface FlyerQrBlock extends FlyerBlockBase {
  type: "qr";
  frameColor: string;
  caption: string;
}

export interface FlyerCreditBlock extends FlyerBlockBase {
  type: "credit";
  caption: string;
  label: string;
  backgroundColor: string;
  textColor: string;
  borderRadius: number;
  font: FlyerFontKey;
}

export type FlyerBlock =
  | FlyerTextBlock
  | FlyerImageBlock
  | FlyerShapeBlock
  | FlyerQrBlock
  | FlyerCreditBlock;

// ---------------------------------------------------------------------------
// Page background
// ---------------------------------------------------------------------------

export type FlyerBackground =
  | { type: "solid"; color: string }
  | { type: "gradient"; from: string; to: string; angle: number }
  | {
      type: "image";
      url: string | null;
      aiPrompt?: string;
      /** Optional wash over the image so foreground text stays readable. */
      overlayColor: string;
      overlayOpacity: number;
    };

export interface FlyerDocument {
  version: 2;
  page: { background: FlyerBackground };
  blocks: FlyerBlock[];
  /** ISO timestamp stamped server-side on each save. */
  savedAt?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function flyerId(): string {
  // crypto.randomUUID exists in the browser and Node 19+.
  return crypto.randomUUID().slice(0, 8);
}

/** Mix a hex color toward white: ratio 0 = color, 1 = white. */
export function tintHex(hex: string, ratio: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const mix = (c: number) =>
    Math.round(c + (255 - c) * Math.min(1, Math.max(0, ratio)));
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export function isFlyerDocument(value: unknown): value is FlyerDocument {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { version?: unknown }).version === 2 &&
    Array.isArray((value as { blocks?: unknown }).blocks)
  );
}

/** All font keys a document uses (for loading Google Fonts). */
export function fontsInDocument(doc: FlyerDocument): FlyerFontKey[] {
  const keys = new Set<FlyerFontKey>(["inter"]);
  for (const b of doc.blocks) {
    if (b.type === "text" || b.type === "credit") keys.add(b.font);
  }
  return [...keys];
}

// ---------------------------------------------------------------------------
// Legacy conversion — turns the old fixed-template FlyerConfig into an
// equivalent block document so existing campaigns keep rendering.
// ---------------------------------------------------------------------------

export interface LegacyConvertContext {
  logoUrl?: string | null;
  questions?: SurveyQuestion[];
}

export function legacyToDocument(
  config: FlyerConfig,
  ctx: LegacyConvertContext = {}
): FlyerDocument {
  const accent = /^#[0-9a-f]{6}$/i.test(config.accentColor)
    ? config.accentColor
    : "#0f766e";

  const blocks: FlyerBlock[] = [];
  let z = 1;

  const background: FlyerBackground =
    config.backgroundMode === "image" && config.backgroundUrl
      ? {
          type: "image",
          url: config.backgroundUrl,
          overlayColor: "#ffffff",
          overlayOpacity: 0.2,
        }
      : { type: "solid", color: tintHex(accent, 0.92) };

  // White panel the content sits on (mirrors the old translucent panel).
  blocks.push({
    id: flyerId(),
    type: "shape",
    shape: "rect",
    color: "#ffffff",
    opacity: 0.94,
    borderRadius: 10,
    x: 40,
    y: 40,
    w: PAGE_W - 80,
    h: PAGE_H - 80,
    rotation: 0,
    z: z++,
  });

  const left = 68;
  const width = PAGE_W - 136;
  let y = 64;

  if (ctx.logoUrl) {
    blocks.push({
      id: flyerId(),
      type: "image",
      url: ctx.logoUrl,
      fit: "contain",
      borderRadius: 0,
      opacity: 1,
      x: left,
      y,
      w: 140,
      h: 40,
      rotation: 0,
      z: z++,
    });
    y += 52;
  }

  if (config.heading) {
    blocks.push({
      id: flyerId(),
      type: "text",
      role: "heading",
      text: config.heading,
      font: "playfair",
      fontSize: 26,
      bold: true,
      color: accent,
      align: "left",
      lineHeight: 1.2,
      backgroundColor: "transparent",
      padding: 0,
      borderRadius: 0,
      x: left,
      y,
      w: width,
      h: 36,
      rotation: 0,
      z: z++,
    });
    y += 44;
  }

  blocks.push({
    id: flyerId(),
    type: "text",
    role: "body",
    text: `Dear {{first_name}},\n\n${config.body ?? ""}`,
    font: "inter",
    fontSize: 11,
    bold: false,
    color: "#374151",
    align: "left",
    lineHeight: 1.55,
    backgroundColor: "transparent",
    padding: 0,
    borderRadius: 0,
    x: left,
    y,
    w: width,
    h: 170,
    rotation: 0,
    z: z++,
  });
  y += 182;

  blocks.push({
    id: flyerId(),
    type: "credit",
    caption: "Our thank-you to you",
    label: "{{credit}} appreciation credit",
    backgroundColor: accent,
    textColor: "#ffffff",
    borderRadius: 8,
    font: "inter",
    x: left,
    y,
    w: width,
    h: 56,
    rotation: 0,
    z: z++,
  });
  y += 72;

  if (config.signature) {
    blocks.push({
      id: flyerId(),
      type: "text",
      role: "signature",
      text: config.signature,
      font: "caveat",
      fontSize: 18,
      bold: false,
      color: "#374151",
      align: "left",
      lineHeight: 1.3,
      backgroundColor: "transparent",
      padding: 0,
      borderRadius: 0,
      x: left,
      y,
      w: width,
      h: 52,
      rotation: 0,
      z: z++,
    });
    y += 64;
  }

  blocks.push({
    id: flyerId(),
    type: "qr",
    frameColor: accent,
    caption: "Scan with your camera",
    x: left,
    y,
    w: 124,
    h: 148,
    rotation: 0,
    z: z + 50,
  });

  blocks.push({
    id: flyerId(),
    type: "text",
    text: "Take the survey\nScan the code, or visit:\n{{survey_url}}",
    font: "inter",
    fontSize: 11,
    bold: false,
    color: "#374151",
    align: "left",
    lineHeight: 1.5,
    backgroundColor: "transparent",
    padding: 0,
    borderRadius: 0,
    x: left + 140,
    y: y + 24,
    w: width - 140,
    h: 80,
    rotation: 0,
    z: z++,
  });
  y += 160;

  if (config.includeQuestions && ctx.questions?.length) {
    const qText = [
      "We value your thoughts",
      ...ctx.questions.map((q, i) => `${i + 1}. ${q.label}`),
    ].join("\n");
    blocks.push({
      id: flyerId(),
      type: "text",
      text: qText,
      font: "inter",
      fontSize: 10,
      bold: false,
      color: "#374151",
      align: "left",
      lineHeight: 1.5,
      backgroundColor: "transparent",
      padding: 0,
      borderRadius: 0,
      x: left,
      y,
      w: width,
      h: Math.min(140, 20 + ctx.questions.length * 16),
      rotation: 0,
      z: z++,
    });
  }

  // Footer
  blocks.push({
    id: flyerId(),
    type: "text",
    text: "{{practice_name}}",
    font: "inter",
    fontSize: 8,
    bold: false,
    color: "#9ca3af",
    align: "left",
    lineHeight: 1.2,
    backgroundColor: "transparent",
    padding: 0,
    borderRadius: 0,
    x: left,
    y: PAGE_H - 76,
    w: width,
    h: 14,
    rotation: 0,
    z: z++,
  });

  return { version: 2, page: { background }, blocks };
}

/** Find the text block a Simple-mode form field maps onto. Prefers explicit
 *  `role` tags (set by the legacy converter and AI designer); falls back to
 *  heuristics for hand-built documents. Returns null when there's no
 *  unambiguous match — the form then creates a fresh block on first edit. */
export function findRoleBlock(
  doc: FlyerDocument,
  role: FlyerTextRole
): FlyerTextBlock | null {
  const texts = doc.blocks.filter((b): b is FlyerTextBlock => b.type === "text");
  const tagged = texts.find((t) => t.role === role);
  if (tagged) return tagged;

  const biggest = texts.reduce<FlyerTextBlock | null>(
    (a, t) => (!a || t.fontSize > a.fontSize ? t : a),
    null
  );
  const longest = texts.reduce<FlyerTextBlock | null>(
    (a, t) => (!a || t.text.length > a.text.length ? t : a),
    null
  );

  switch (role) {
    case "body":
      return longest;
    case "heading":
      // A heading that's also the body is ambiguous — let the form create one.
      return biggest && biggest !== longest ? biggest : null;
    case "signature": {
      const sig =
        texts.find((t) => t.font === "caveat") ??
        texts.find((t) => /gratitude|sincerely|warmly|dr\./i.test(t.text));
      return sig && sig !== longest && sig !== biggest ? (sig ?? null) : null;
    }
  }
}

/** Ensure structural invariants after any untrusted source (AI, old data):
 *  exactly one QR block, ids unique, geometry within sane bounds. */
export function ensureDocumentSafety(doc: FlyerDocument): FlyerDocument {
  const seen = new Set<string>();
  let blocks = doc.blocks.slice(0, 40).map((b) => {
    let id = b.id;
    while (!id || seen.has(id)) id = flyerId();
    seen.add(id);
    return {
      ...b,
      id,
      x: clamp(b.x, -PAGE_W, PAGE_W * 1.5),
      y: clamp(b.y, -PAGE_H, PAGE_H * 1.5),
      w: clamp(b.w, 8, PAGE_W * 1.5),
      h: clamp(b.h, 8, PAGE_H * 1.5),
      rotation: clamp(b.rotation ?? 0, -360, 360),
      z: clamp(b.z ?? 1, 0, 500),
    };
  });

  const qrBlocks = blocks.filter((b) => b.type === "qr");
  if (qrBlocks.length === 0) {
    blocks.push({
      id: flyerId(),
      type: "qr",
      frameColor: "#0f766e",
      caption: "Scan with your camera",
      x: PAGE_W - 192,
      y: PAGE_H - 220,
      w: 124,
      h: 148,
      rotation: 0,
      z: 100,
    });
  } else if (qrBlocks.length > 1) {
    const keep = qrBlocks[0].id;
    blocks = blocks.filter((b) => b.type !== "qr" || b.id === keep);
  }

  return { ...doc, version: 2, blocks };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
}
