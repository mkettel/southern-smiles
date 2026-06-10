"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  flyerDocumentSchema,
  generateAiFlyerSchema,
  generateAiImageSchema,
} from "@/lib/validators";
import {
  generateFlyerImage,
  isImageGenConfigured,
  ImageGenNotConfiguredError,
  type FlyerImageAspect,
} from "@/lib/ai/image";
import { generateFlyerLayout } from "@/lib/ai/layout";
import { getPracticeSettings } from "@/actions/settings";
import {
  ensureDocumentSafety,
  type FlyerDocument,
  type FlyerImageBlock,
} from "@/lib/flyer/types";
import type { SurveyQuestion } from "@/lib/types";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, practice_id")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") throw new Error("Admin access required");
  return { supabase, user, practiceId: profile.practice_id as string };
}

const BUCKET = "flyer-assets";

/** Persist the flyer block document (v2) to the campaign. */
export async function saveFlyerDocument(campaignId: string, doc: FlyerDocument) {
  const { supabase } = await requireAdmin();
  const parsed = flyerDocumentSchema.safeParse(doc);
  if (!parsed.success) return { error: "Invalid flyer document" };

  const safe = ensureDocumentSafety(parsed.data as FlyerDocument);
  safe.savedAt = new Date().toISOString();
  const { error } = await supabase
    .from("survey_campaigns")
    .update({ flyer_config: safe, updated_at: safe.savedAt })
    .eq("id", campaignId);
  if (error) return { error: error.message };

  revalidatePath(`/admin/surveys/${campaignId}`);
  return { success: true, savedAt: safe.savedAt };
}

/** Upload a flyer image (background or block); returns its public URL. */
export async function uploadFlyerImage(formData: FormData) {
  const { supabase, practiceId } = await requireAdmin();

  const file = formData.get("image") as File;
  if (!file || file.size === 0) return { error: "No file provided" };
  if (file.size > 8 * 1024 * 1024) return { error: "Image must be under 8MB" };

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
  // Chrome renders the PDF, so anything the browser displays works.
  const allowed = ["png", "jpg", "jpeg", "webp"];
  if (!allowed.includes(ext)) return { error: "Use a PNG, JPG, or WebP image" };

  const filename = `${practiceId}/img-${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filename, file, { cacheControl: "3600", upsert: true });
  if (uploadError) return { error: uploadError.message };

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);
  return { success: true, url: data.publicUrl };
}

async function generateAndStoreImage(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  practiceId: string,
  prompt: string,
  kind: "background" | "illustration",
  aspect: FlyerImageAspect
): Promise<{ url: string; width: number; height: number }> {
  const { png, width, height } = await generateFlyerImage(prompt, { kind, aspect });
  const filename = `${practiceId}/ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.png`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filename, png, { contentType: "image/png", upsert: true });
  if (uploadError) throw new Error(uploadError.message);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);
  return { url: data.publicUrl, width, height };
}

/** Generate one image with AI and store it; returns its public URL + size. */
export async function generateAiImage(input: {
  campaign_id: string;
  prompt: string;
  kind: "background" | "illustration";
  aspect: FlyerImageAspect;
}) {
  const { supabase, practiceId } = await requireAdmin();
  if (!isImageGenConfigured()) {
    return { error: "AI image generation isn't configured on the server." };
  }
  const parsed = generateAiImageSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };

  try {
    const { url, width, height } = await generateAndStoreImage(
      supabase,
      practiceId,
      parsed.data.prompt,
      parsed.data.kind,
      parsed.data.aspect
    );
    return { success: true, url, width, height };
  } catch (e) {
    if (e instanceof ImageGenNotConfiguredError)
      return { error: "AI image generation isn't configured on the server." };
    return { error: e instanceof Error ? e.message : "Generation failed" };
  }
}

function aspectFor(w: number, h: number): FlyerImageAspect {
  const r = w / h;
  if (r > 1.3) return "landscape";
  if (r < 0.77) return "portrait";
  return "square";
}

/** AI-design a complete flyer: the LLM composes the document, then we
 *  generate art for any image blocks it sketched (capped for cost). */
export async function generateAiFlyerDocument(input: {
  campaign_id: string;
  brief: string;
  tone: "warm" | "playful" | "professional";
}) {
  const { supabase, practiceId } = await requireAdmin();
  if (!isImageGenConfigured()) {
    return { error: "AI design isn't configured on the server." };
  }
  const parsed = generateAiFlyerSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };

  const { data: campaign } = await supabase
    .from("survey_campaigns")
    .select("title, questions, credit_amount_cents")
    .eq("id", parsed.data.campaign_id)
    .single();
  if (!campaign) return { error: "Campaign not found" };

  try {
    const settings = await getPracticeSettings();
    const doc = await generateFlyerLayout({
      brief: parsed.data.brief,
      tone: parsed.data.tone,
      practiceName: settings.name,
      creditLabel: `$${Math.round((campaign.credit_amount_cents ?? 0) / 100)}`,
      questions: (campaign.questions as SurveyQuestion[]) ?? [],
    });

    // Fill in the art the model sketched. Cap generations to control cost.
    let budget = 3;
    const tasks: Promise<void>[] = [];

    const bg = doc.page.background;
    if (bg.type === "image" && !bg.url && bg.aiPrompt && budget > 0) {
      budget--;
      tasks.push(
        generateAndStoreImage(supabase, practiceId, bg.aiPrompt, "background", "portrait").then(
          ({ url }) => {
            bg.url = url;
          }
        )
      );
    }

    for (const block of doc.blocks) {
      if (block.type !== "image") continue;
      const img = block as FlyerImageBlock;
      if (img.url || !img.aiPrompt || budget <= 0) continue;
      budget--;
      tasks.push(
        generateAndStoreImage(
          supabase,
          practiceId,
          img.aiPrompt,
          "illustration",
          aspectFor(img.w, img.h)
        ).then(({ url, width, height }) => {
          img.url = url;
          img.naturalWidth = width;
          img.naturalHeight = height;
        })
      );
    }

    await Promise.all(tasks);

    // Drop image blocks that never got art (over budget / no prompt).
    doc.blocks = doc.blocks.filter((b) => b.type !== "image" || (b as FlyerImageBlock).url);
    if (doc.page.background.type === "image" && !doc.page.background.url) {
      doc.page.background = { type: "solid", color: "#fdf9f3" };
    }

    return { success: true, document: ensureDocumentSafety(doc) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "AI design failed" };
  }
}
