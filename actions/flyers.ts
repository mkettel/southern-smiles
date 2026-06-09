"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { flyerConfigSchema, generateAiBackgroundSchema } from "@/lib/validators";
import {
  generateFlyerBackground,
  isImageGenConfigured,
  ImageGenNotConfiguredError,
} from "@/lib/ai/image";
import type { FlyerConfig } from "@/lib/types";

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

export async function saveFlyerConfig(campaignId: string, config: FlyerConfig) {
  const { supabase } = await requireAdmin();
  const parsed = flyerConfigSchema.safeParse(config);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const { error } = await supabase
    .from("survey_campaigns")
    .update({ flyer_config: parsed.data, updated_at: new Date().toISOString() })
    .eq("id", campaignId);
  if (error) return { error: error.message };

  revalidatePath(`/admin/surveys/${campaignId}`);
  return { success: true };
}

/** Upload a flyer background image; returns its public URL. */
export async function uploadFlyerBackground(formData: FormData) {
  const { supabase, practiceId } = await requireAdmin();

  const file = formData.get("background") as File;
  if (!file || file.size === 0) return { error: "No file provided" };
  if (file.size > 8 * 1024 * 1024) return { error: "Image must be under 8MB" };

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const allowed = ["png", "jpg", "jpeg", "webp"];
  if (!allowed.includes(ext)) return { error: "Use PNG, JPG, or WebP" };

  const filename = `${practiceId}/bg-${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filename, file, { cacheControl: "3600", upsert: true });
  if (uploadError) return { error: uploadError.message };

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);
  return { success: true, url: data.publicUrl };
}

/** Generate a background with AI and store it; returns its public URL. */
export async function generateAiBackground(input: {
  campaign_id: string;
  prompt: string;
}) {
  const { supabase, practiceId } = await requireAdmin();
  if (!isImageGenConfigured()) {
    return { error: "AI image generation isn't configured on the server." };
  }
  const parsed = generateAiBackgroundSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };

  try {
    const png = await generateFlyerBackground(parsed.data.prompt);
    const filename = `${practiceId}/ai-${Date.now()}.png`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filename, png, { contentType: "image/png", upsert: true });
    if (uploadError) return { error: uploadError.message };

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);
    return { success: true, url: data.publicUrl };
  } catch (e) {
    if (e instanceof ImageGenNotConfiguredError)
      return { error: "AI image generation isn't configured on the server." };
    return { error: e instanceof Error ? e.message : "Generation failed" };
  }
}
