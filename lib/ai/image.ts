// Optional AI background generation for flyers. Env-gated — if no key is set,
// callers hide the feature and everything else still works. We only generate
// *background art*; the QR code and patient name are always composited
// deterministically on top, so the model's text quality is irrelevant.

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

/**
 * Generate a portrait flyer background. Returns PNG bytes.
 * Wraps the user's prompt to keep the result text-free and overlay-friendly.
 */
export async function generateFlyerBackground(prompt: string): Promise<Buffer> {
  if (!isImageGenConfigured()) throw new ImageGenNotConfiguredError();

  const wrapped =
    `Elegant, minimal background design for a dental practice mailer. ${prompt}. ` +
    `Soft and uncluttered, calm color palette, plenty of clean negative space ` +
    `(especially center and lower area) for text to be overlaid later. ` +
    `Absolutely no text, words, letters, numbers, logos, or QR codes.`;

  const res = await fetch(OPENAI_IMAGES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt: wrapped,
      size: "1024x1536",
      n: 1,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Image generation failed (${res.status}): ${detail.slice(0, 200)}`);
  }

  const json = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
  const item = json.data?.[0];
  if (item?.b64_json) return Buffer.from(item.b64_json, "base64");
  if (item?.url) {
    const img = await fetch(item.url);
    return Buffer.from(await img.arrayBuffer());
  }
  throw new Error("Image generation returned no image");
}
