"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPracticeId } from "@/lib/practice";

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

  let practiceId: string;
  try {
    practiceId = await getCurrentPracticeId(supabase);
  } catch {
    // User might not be authenticated (e.g., login page metadata)
    // Fall back to first practice
    const { data } = await supabase.from("practices").select("*").limit(1).single();
    return (data as PracticeSettings) ?? DEFAULT_SETTINGS;
  }

  const { data } = await supabase
    .from("practices")
    .select("*")
    .eq("id", practiceId)
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
    .select("role, practice_id")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return { error: "Admin access required" };

  if (input.name !== undefined && !input.name.trim()) {
    return { error: "Practice name is required" };
  }

  const { error } = await supabase
    .from("practices")
    .update({
      ...input,
      name: input.name?.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", profile.practice_id);

  if (error) return { error: error.message };

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

  const result = await updatePracticeSettings({ logo_url: logoUrl });
  if (result.error) return result;

  return { success: true, logo_url: logoUrl };
}
