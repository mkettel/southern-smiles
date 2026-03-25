"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface PracticeSettings {
  id: string;
  name: string;
  short_name: string | null;
  tagline: string | null;
  logo_url: string | null;
  show_name_with_logo: boolean;
  primary_color: string;
  address: string | null;
  phone: string | null;
  website: string | null;
}

const DEFAULT_SETTINGS: PracticeSettings = {
  id: "",
  name: "My Practice",
  short_name: null,
  tagline: null,
  logo_url: null,
  show_name_with_logo: true,
  primary_color: "#0a0a0a",
  address: null,
  phone: null,
  website: null,
};

export async function getPracticeSettings(): Promise<PracticeSettings> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("practice_settings")
    .select("*")
    .limit(1)
    .single();

  return (data as PracticeSettings) ?? DEFAULT_SETTINGS;
}

export async function updatePracticeSettings(input: {
  name?: string;
  short_name?: string | null;
  tagline?: string | null;
  logo_url?: string | null;
  show_name_with_logo?: boolean;
  primary_color?: string;
  address?: string | null;
  phone?: string | null;
  website?: string | null;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return { error: "Admin access required" };

  if (input.name !== undefined && !input.name.trim()) {
    return { error: "Practice name is required" };
  }

  // Get existing settings ID
  const { data: existing } = await supabase
    .from("practice_settings")
    .select("id")
    .limit(1)
    .single();

  if (!existing) {
    // Create if doesn't exist
    const { error } = await supabase.from("practice_settings").insert({
      ...input,
      name: input.name?.trim() ?? "My Practice",
    });
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("practice_settings")
      .update({
        ...input,
        name: input.name?.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

export async function uploadLogo(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return { error: "Admin access required" };

  const file = formData.get("logo") as File;
  if (!file || file.size === 0) return { error: "No file provided" };

  if (file.size > 2 * 1024 * 1024) {
    return { error: "Logo must be under 2MB" };
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const allowed = ["png", "jpg", "jpeg", "svg", "webp"];
  if (!allowed.includes(ext)) {
    return { error: "Logo must be PNG, JPG, SVG, or WebP" };
  }

  const filename = `logo-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("logos")
    .upload(filename, file, {
      cacheControl: "3600",
      upsert: true,
    });

  if (uploadError) return { error: uploadError.message };

  const { data: urlData } = supabase.storage
    .from("logos")
    .getPublicUrl(filename);

  const logoUrl = urlData.publicUrl;

  // Update practice settings with new logo URL
  const result = await updatePracticeSettings({ logo_url: logoUrl });
  if (result.error) return result;

  return { success: true, logo_url: logoUrl };
}
