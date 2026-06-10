// Optional AI image generation for flyers. Env-gated — if no key is set,
// callers hide the feature and everything else still works. We only generate
// *decorative art* (backgrounds and spot illustrations); the QR code, patient
// name, and all copy are always composited deterministically on top, so the
// model's text quality is irrelevant.

const OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations";

export function isImageGenConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export class ImageGenNotConfiguredError extends Error {
  constructor() {
    super("AI image generation is not configured on the server.");
    this.name = "ImageGenNotConfiguredError";
  }
}

export type FlyerImageKind = "background" | "illustration";
export type FlyerImageAspect = "portrait" | "landscape" | "square";

const SIZES: Record<FlyerImageAspect, { size: string; width: number; height: number }> = {
  portrait: { size: "1024x1536", width: 1024, height: 1536 },
  landscape: { size: "1536x1024", width: 1536, height: 1024 },
  square: { size: "1024x1024", width: 1024, height: 1024 },
};

const WRAPPERS: Record<FlyerImageKind, (prompt: string) => string> = {
  background: (prompt) =>
    `Elegant, minimal background design for a dental practice mailer. ${prompt}. ` +
    `Soft and uncluttered, calm color palette, plenty of clean negative space ` +
    `(especially center and lower area) for text to be overlaid later. ` +
    `Absolutely no text, words, letters, numbers, logos, or QR codes.`,
  illustration: (prompt) =>
    `Friendly spot illustration for a dental practice mailer. ${prompt}. ` +
    `Simple, warm, modern flat-illustration style with a clean composition ` +
    `that reads well at small print sizes. ` +
    `Absolutely no text, words, letters, numbers, logos, or QR codes.`,
};

/** Generate flyer art. Returns PNG bytes plus the pixel dimensions. */
export async function generateFlyerImage(
  prompt: string,
  opts: { kind?: FlyerImageKind; aspect?: FlyerImageAspect } = {}
): Promise<{ png: Buffer; width: number; height: number }> {
  if (!isImageGenConfigured()) throw new ImageGenNotConfiguredError();

  const kind = opts.kind ?? "illustration";
  const aspect = SIZES[opts.aspect ?? "square"];

  const res = await fetch(OPENAI_IMAGES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt: WRAPPERS[kind](prompt),
      size: aspect.size,
      n: 1,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Image generation failed (${res.status}): ${detail.slice(0, 200)}`);
  }

  const json = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
  const item = json.data?.[0];
  if (item?.b64_json) {
    return {
      png: Buffer.from(item.b64_json, "base64"),
      width: aspect.width,
      height: aspect.height,
    };
  }
  if (item?.url) {
    const img = await fetch(item.url);
    return {
      png: Buffer.from(await img.arrayBuffer()),
      width: aspect.width,
      height: aspect.height,
    };
  }
  throw new Error("Image generation returned no image");
}
