"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPracticeId } from "@/lib/practice";
import { changelogEntrySchema } from "@/lib/validators";
import type { ChangelogEntry } from "@/lib/types";

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
  return { supabase, userId: user.id, practiceId: profile.practice_id as string };
}

export async function listChangelog(): Promise<ChangelogEntry[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const [{ data: entries }, { data: reads }] = await Promise.all([
    supabase
      .from("changelog_entries")
      .select(
        "*, author:profiles!changelog_entries_author_id_fkey(id, full_name, avatar_url, avatar_color)"
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("changelog_reads")
      .select("entry_id")
      .eq("profile_id", user.id),
  ]);

  const readSet = new Set((reads ?? []).map((r) => r.entry_id));
  return (entries ?? []).map((e) => ({
    ...(e as ChangelogEntry),
    is_unread: !readSet.has((e as ChangelogEntry).id),
  }));
}

export async function getUnreadChangelogCount(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  // RLS already filters to entries this user can see.
  const [{ data: entries }, { data: reads }] = await Promise.all([
    supabase.from("changelog_entries").select("id"),
    supabase.from("changelog_reads").select("entry_id").eq("profile_id", user.id),
  ]);

  if (!entries) return 0;
  const readSet = new Set((reads ?? []).map((r) => r.entry_id));
  return entries.filter((e) => !readSet.has(e.id)).length;
}

export async function createChangelogEntry(input: {
  title: string;
  body: unknown;
  image_url?: string | null;
  video_url?: string | null;
  tags?: string[];
  visibility?: "admin" | "everyone";
}) {
  const { supabase, userId, practiceId } = await requireAdmin();
  const parsed = changelogEntrySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const { data, error } = await supabase
    .from("changelog_entries")
    .insert({
      practice_id: practiceId,
      author_id: userId,
      title: parsed.data.title.trim(),
      body: parsed.data.body,
      image_url: parsed.data.image_url ?? null,
      video_url: parsed.data.video_url ?? null,
      tags: parsed.data.tags ?? [],
      visibility: parsed.data.visibility ?? "admin",
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  // Mark new entry as read for the author so it doesn't show as unread to themselves.
  await supabase
    .from("changelog_reads")
    .insert({ entry_id: data.id, profile_id: userId, practice_id: practiceId });

  revalidatePath("/", "layout");
  revalidatePath("/admin/updates");
  return { success: true, id: data.id };
}

export async function updateChangelogEntry(
  id: string,
  input: {
    title?: string;
    body?: unknown;
    image_url?: string | null;
    video_url?: string | null;
    tags?: string[];
    visibility?: "admin" | "everyone";
  }
) {
  const { supabase } = await requireAdmin();

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) update.title = input.title.trim();
  if (input.body !== undefined) update.body = input.body;
  if (input.image_url !== undefined) update.image_url = input.image_url;
  if (input.video_url !== undefined) update.video_url = input.video_url;
  if (input.tags !== undefined) update.tags = input.tags;
  if (input.visibility !== undefined) update.visibility = input.visibility;

  const { error } = await supabase
    .from("changelog_entries")
    .update(update)
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  revalidatePath("/admin/updates");
  return { success: true };
}

export async function deleteChangelogEntry(id: string) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("changelog_entries").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  revalidatePath("/admin/updates");
  return { success: true };
}

export async function markChangelogRead(entryIds: string[]) {
  if (entryIds.length === 0) return { success: true };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const practiceId = await getCurrentPracticeId(supabase);

  const rows = entryIds.map((entry_id) => ({
    entry_id,
    profile_id: user.id,
    practice_id: practiceId,
  }));

  const { error } = await supabase
    .from("changelog_reads")
    .upsert(rows, { onConflict: "entry_id,profile_id" });

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { success: true };
}

export async function markAllChangelogRead() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: entries } = await supabase
    .from("changelog_entries")
    .select("id");

  if (!entries || entries.length === 0) return { success: true };

  return markChangelogRead(entries.map((e) => e.id));
}

const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "webp", "svg"] as const;
const VIDEO_EXTS = ["mp4", "webm", "mov", "m4v"] as const;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const VIDEO_MAX_BYTES = 25 * 1024 * 1024; // 25 MB

export async function uploadChangelogMedia(
  formData: FormData,
): Promise<
  | { success: true; url: string; type: "image" | "video" }
  | { error: string }
> {
  const { supabase } = await requireAdmin();

  // Accept either field name for backwards compatibility with older callers.
  const file = (formData.get("media") ?? formData.get("image")) as File | null;
  if (!file || file.size === 0) return { error: "No file provided" };

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const isImage = (IMAGE_EXTS as readonly string[]).includes(ext);
  const isVideo = (VIDEO_EXTS as readonly string[]).includes(ext);

  if (!isImage && !isVideo) {
    return {
      error: "File must be an image (PNG, JPG, GIF, WebP, SVG) or video (MP4, WebM, MOV)",
    };
  }

  const maxBytes = isImage ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES;
  if (file.size > maxBytes) {
    const limit = isImage ? "5MB" : "25MB";
    return { error: `File must be under ${limit}` };
  }

  const filename = `changelog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("changelog-images")
    .upload(filename, file, { cacheControl: "3600", upsert: false });

  if (uploadError) return { error: uploadError.message };

  const { data: urlData } = supabase.storage
    .from("changelog-images")
    .getPublicUrl(filename);

  return { success: true, url: urlData.publicUrl, type: isImage ? "image" : "video" };
}

/**
 * @deprecated Use {@link uploadChangelogMedia}. Kept for callers that only
 * expect images and don't care about the media type in the result.
 */
export async function uploadChangelogImage(formData: FormData) {
  const result = await uploadChangelogMedia(formData);
  if ("error" in result) return result;
  if (result.type !== "image") return { error: "Only images are accepted here" };
  return { success: true as const, url: result.url };
}
