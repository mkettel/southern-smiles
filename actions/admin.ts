"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { divisionSchema, postSchema, statDefinitionSchema } from "@/lib/validators";

// ============================================================
// Divisions
// ============================================================

export async function getDivisions() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("divisions")
    .select("*")
    .order("number");
  return data ?? [];
}

export async function createDivision(input: { number: number; name: string }) {
  const supabase = await createClient();
  const parsed = divisionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const { error } = await supabase.from("divisions").insert(parsed.data);
  if (error) return { error: error.message };

  revalidatePath("/admin/divisions");
  return { success: true };
}

export async function deleteDivision(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("divisions").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/divisions");
  return { success: true };
}

// ============================================================
// Posts
// ============================================================

export async function getPosts() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("posts")
    .select("*, division:divisions(*)")
    .order("title");
  return data ?? [];
}

export async function createPost(input: {
  title: string;
  division_id: string;
}) {
  const supabase = await createClient();
  const parsed = postSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const { error } = await supabase.from("posts").insert(parsed.data);
  if (error) return { error: error.message };

  revalidatePath("/admin/posts");
  return { success: true };
}

export async function deletePost(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("posts").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/posts");
  return { success: true };
}

// ============================================================
// Stats
// ============================================================

export async function getStats() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("stats")
    .select("*, post:posts(*, division:divisions(*))")
    .order("display_order");
  return data ?? [];
}

export async function createStat(input: {
  name: string;
  abbreviation?: string | null;
  stat_type: "dollar" | "percentage" | "count";
  good_direction: "up" | "down";
  post_id: string;
  display_order?: number;
}) {
  const supabase = await createClient();
  const parsed = statDefinitionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const { error } = await supabase.from("stats").insert(parsed.data);
  if (error) return { error: error.message };

  revalidatePath("/admin/stats");
  return { success: true };
}

export async function toggleStat(id: string, isActive: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("stats")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/stats");
  revalidatePath("/dashboard");
  return { success: true };
}

// ============================================================
// Employees
// ============================================================

export async function getEmployees() {
  const supabase = await createClient();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .order("full_name");

  const { data: assignments } = await supabase
    .from("employee_posts")
    .select("*, post:posts(*, division:divisions(*))");

  return {
    profiles: profiles ?? [],
    assignments: assignments ?? [],
  };
}

export async function assignPost(profileId: string, postId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("employee_posts").insert({
    profile_id: profileId,
    post_id: postId,
  });
  if (error) return { error: error.message };

  revalidatePath("/admin/employees");
  return { success: true };
}

export async function removePostAssignment(assignmentId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("employee_posts")
    .delete()
    .eq("id", assignmentId);
  if (error) return { error: error.message };

  revalidatePath("/admin/employees");
  return { success: true };
}
