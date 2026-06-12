// AI flyer design: an LLM composes a complete FlyerDocument (layout, copy,
// palette, fonts) as JSON. Image blocks come back with `aiPrompt` instead of
// a URL — the caller generates that art separately and fills the URLs in.
// All informational content (names, QR, credit) stays deterministic: the
// model only places blocks and writes copy with merge tokens.

import { flyerDocumentSchema } from "@/lib/validators";
import {
  ensureDocumentSafety,
  type FlyerDocument,
} from "@/lib/flyer/types";
import type { SurveyQuestion } from "@/lib/types";

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

export function isLayoutGenConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export interface LayoutBrief {
  brief: string;
  tone: "warm" | "playful" | "professional";
  practiceName: string;
  creditLabel: string;
  questions: SurveyQuestion[];
}

const SYSTEM_PROMPT = `You are a print designer creating a one-page US Letter mail flyer for a dental practice. You output ONLY a JSON object — a flyer document in this exact format.

PAGE: 612 x 792 points. Keep all content inside x:24..588, y:24..768.

DOCUMENT SHAPE:
{
  "version": 2,
  "page": { "background": <background> },
  "blocks": [ <block>, ... ]
}

BACKGROUND (pick one):
- { "type": "solid", "color": "#rrggbb" }
- { "type": "gradient", "from": "#rrggbb", "to": "#rrggbb", "angle": 0-360 }
- { "type": "image", "url": null, "aiPrompt": "<art description>", "overlayColor": "#ffffff", "overlayOpacity": 0-0.9 } — when using a background image, ALWAYS set overlayOpacity 0.5-0.8 so text stays readable.

EVERY block has: "id" (short unique string), "x","y","w","h" (points), "rotation" (deg, usually 0), "z" (stack order, higher = on top).

BLOCK TYPES:
- text: { "type":"text", "text":"...", "font":"inter|poppins|nunito|playfair|lora|caveat", "fontSize":6-72, "bold":true|false, "color":"#rrggbb", "align":"left|center|right", "lineHeight":1.0-2.0, "backgroundColor":"transparent"|"#rrggbb", "padding":0-30, "borderRadius":0-30, "role":"heading|body|signature" (optional) } — tag the main headline "heading", the letter body "body", and the sign-off "signature".
- image: { "type":"image", "url":null, "aiPrompt":"<art description>", "fit":"cover", "borderRadius":0-40, "opacity":1 }
- shape: { "type":"shape", "shape":"rect|line|circle|blob1|blob2|wave|tooth|sparkle|heart", "color":"#rrggbb", "opacity":0.05-1, "borderRadius":0-40 } — "line" is a thin divider (give it a small h like 3-4).
- qr: { "type":"qr", "frameColor":"#rrggbb", "caption":"Scan with your camera" } — REQUIRED, exactly one, at least 110w x 130h.
- credit: { "type":"credit", "caption":"<short caption>", "label":"{{credit}} appreciation credit", "backgroundColor":"#rrggbb", "textColor":"#ffffff", "borderRadius":8, "font":"<font>" } — include unless the brief says otherwise.

MERGE TOKENS for text: {{first_name}}, {{full_name}}, {{practice_name}}, {{credit}}, {{survey_url}}. Start the letter body with "Dear {{first_name}},". Include a small text block near the QR with "Take the survey — scan the code or visit {{survey_url}}".

DESIGN RULES:
- 6-12 blocks. Generous whitespace. Align blocks to a consistent left margin or center.
- Pick ONE font pairing: a display font (playfair, poppins, or nunito) for the headline + a body font (inter, lora, or nunito). caveat works for signatures.
- Pick a cohesive 2-3 color palette suited to the brief. Text must contrast strongly with what's behind it (if text sits on the background, check the background color; if on a shape, check the shape color).
- Use shapes tastefully for playfulness (a wave footer band, a soft blob behind an illustration, a small tooth or sparkle accent). 1-3 shapes max.
- 0-2 image blocks with "aiPrompt" describing decorative art (no text in the art). Use them as a hero band or a spot illustration.
- Do not overlap text blocks with each other or with the QR block. Leave the QR block's area clear.
- Body copy: 2-4 short, sincere paragraphs (separate with \\n\\n) matching the requested tone. Mention the appreciation credit.`;

function userPrompt(input: LayoutBrief): string {
  return JSON.stringify({
    brief: input.brief,
    tone: input.tone,
    practice_name: input.practiceName,
    credit: input.creditLabel,
    survey_questions: input.questions.map((q) => q.label),
  });
}

/** Ask the model for a flyer document. Throws on failure. */
export async function generateFlyerLayout(input: LayoutBrief): Promise<FlyerDocument> {
  if (!isLayoutGenConfigured()) {
    throw new Error("AI design is not configured on the server.");
  }

  const res = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_LAYOUT_MODEL ?? "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt(input) },
      ],
      temperature: 0.8,
      max_tokens: 4000,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`AI design failed (${res.status}): ${detail.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI design returned no content");

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error("AI design returned invalid JSON");
  }

  // Force invariants the model sometimes forgets, then validate strictly.
  const candidate = raw as Record<string, unknown>;
  candidate.version = 2;

  const parsed = flyerDocumentSchema.safeParse(candidate);
  if (!parsed.success) {
    // Salvage: drop only the invalid blocks and re-validate.
    const blocks = Array.isArray(candidate.blocks) ? candidate.blocks : [];
    const salvaged = {
      ...candidate,
      blocks: blocks.filter(
        (b) => flyerDocumentSchema.shape.blocks.element.safeParse(b).success
      ),
    };
    const retry = flyerDocumentSchema.safeParse(salvaged);
    if (!retry.success || retry.data.blocks.length < 3) {
      throw new Error("AI design came back malformed — try rephrasing the brief");
    }
    return ensureDocumentSafety(retry.data as FlyerDocument);
  }

  return ensureDocumentSafety(parsed.data as FlyerDocument);
}
