"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { divisionSchema, postSchema, statDefinitionSchema } from "@/lib/validators";

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
  const { supabase, practiceId } = await requireAdmin();
  const parsed = divisionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const { error } = await supabase.from("divisions").insert({ ...parsed.data, practice_id: practiceId });
  if (error) return { error: error.message };

  revalidatePath("/admin/divisions");
  return { success: true };
}

export async function updateDivision(
  id: string,
  input: { number?: number; name?: string }
) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("divisions")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/employees");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function deleteDivision(id: string) {
  const { supabase } = await requireAdmin();

  // Check if division has posts
  const { count } = await supabase
    .from("posts")
    .select("*", { count: "exact", head: true })
    .eq("division_id", id);

  if (count && count > 0) {
    return { error: "Cannot delete a division that has posts. Remove or reassign posts first." };
  }

  const { error } = await supabase.from("divisions").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/employees");
  revalidatePath("/dashboard");
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
  const { supabase, practiceId } = await requireAdmin();
  const parsed = postSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const { error } = await supabase.from("posts").insert({ ...parsed.data, practice_id: practiceId });
  if (error) return { error: error.message };

  revalidatePath("/admin/posts");
  return { success: true };
}

export async function updatePost(
  id: string,
  input: { title?: string; division_id?: string }
) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("posts")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/employees");
  revalidatePath("/dashboard");
  revalidatePath("/enter");
  revalidatePath("/oic-log");
  return { success: true };
}

export async function deletePost(id: string) {
  const { supabase } = await requireAdmin();

  // Check if post has active stats or employee assignments
  const [{ count: statCount }, { count: assignCount }] = await Promise.all([
    supabase.from("stats").select("*", { count: "exact", head: true }).eq("post_id", id),
    supabase.from("employee_posts").select("*", { count: "exact", head: true }).eq("post_id", id),
  ]);

  if ((statCount ?? 0) > 0) {
    return { error: "Cannot delete a post that has stats. Deactivate or remove stats first." };
  }
  if ((assignCount ?? 0) > 0) {
    return { error: "Cannot delete a post that has employees assigned. Remove assignments first." };
  }

  const { error } = await supabase.from("posts").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/employees");
  revalidatePath("/dashboard");
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
  const { supabase, practiceId } = await requireAdmin();
  const parsed = statDefinitionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const { error } = await supabase.from("stats").insert({ ...parsed.data, practice_id: practiceId });
  if (error) return { error: error.message };

  revalidatePath("/admin/stats");
  return { success: true };
}

export async function updateStat(
  id: string,
  input: {
    name?: string;
    abbreviation?: string | null;
    stat_type?: "dollar" | "percentage" | "count";
    good_direction?: "up" | "down";
    post_id?: string;
    display_order?: number;
  }
) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("stats")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/stats");
  revalidatePath("/dashboard");
  revalidatePath("/enter");
  return { success: true };
}

export async function toggleStat(id: string, isActive: boolean) {
  const { supabase } = await requireAdmin();
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

export async function updateProfile(
  id: string,
  input: {
    full_name?: string;
    username?: string | null;
    avatar_url?: string | null;
    role?: "admin" | "employee";
    is_active?: boolean;
  }
) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("profiles")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/employees");
  revalidatePath("/team");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function assignPost(profileId: string, postId: string) {
  const { supabase, practiceId } = await requireAdmin();
  const { error } = await supabase.from("employee_posts").insert({
    profile_id: profileId,
    post_id: postId,
    practice_id: practiceId,
  });
  if (error) return { error: error.message };

  revalidatePath("/admin/employees");
  return { success: true };
}

/**
 * Create a new post with stats and employee assignment in one operation.
 * Validates all inputs and rolls back on any failure.
 */
export async function createPostWithStats(input: {
  postTitle: string;
  divisionId: string;
  stats: {
    name: string;
    abbreviation?: string;
    stat_type: "dollar" | "percentage" | "count";
    good_direction: "up" | "down";
  }[];
  employeeId?: string;
}) {
  const { supabase, practiceId } = await requireAdmin();

  // Validate inputs
  if (!input.postTitle.trim()) return { error: "Post title is required" };
  if (!input.divisionId) return { error: "Division is required" };
  if (input.stats.length === 0) return { error: "At least one stat is required" };

  // Check for duplicate stat names
  const statNames = input.stats.map((s) => s.name.toLowerCase().trim());
  if (new Set(statNames).size !== statNames.length) {
    return { error: "Stat names must be unique" };
  }

  for (const s of input.stats) {
    if (!s.name.trim()) return { error: "All stats must have a name" };
  }

  // 1. Create the post
  const { data: post, error: postError } = await supabase
    .from("posts")
    .insert({ title: input.postTitle.trim(), division_id: input.divisionId, practice_id: practiceId })
    .select("id")
    .single();

  if (postError || !post) {
    return { error: postError?.message ?? "Failed to create post" };
  }

  // 2. Create stats for this post
  const statRows = input.stats.map((s, i) => ({
    name: s.name.trim(),
    abbreviation: s.abbreviation?.trim() || null,
    stat_type: s.stat_type,
    good_direction: s.good_direction,
    post_id: post.id,
    display_order: i + 1,
    practice_id: practiceId,
  }));

  const { error: statsError } = await supabase
    .from("stats")
    .insert(statRows);

  if (statsError) {
    await supabase.from("posts").delete().eq("id", post.id);
    return { error: statsError.message };
  }

  // 3. Assign employee if provided
  if (input.employeeId) {
    const { error: assignError } = await supabase
      .from("employee_posts")
      .insert({ profile_id: input.employeeId, post_id: post.id, practice_id: practiceId });

    if (assignError) {
      // Rollback: delete stats and post (cascade will handle stats via FK)
      await supabase.from("posts").delete().eq("id", post.id);
      return { error: assignError.message };
    }
  }

  revalidatePath("/admin/employees");
  revalidatePath("/admin/stats");
  revalidatePath("/dashboard");
  revalidatePath("/enter");
  revalidatePath("/oic-log");
  return { success: true, postId: post.id };
}

export async function removePostAssignment(assignmentId: string) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("employee_posts")
    .delete()
    .eq("id", assignmentId);
  if (error) return { error: error.message };

  revalidatePath("/admin/employees");
  return { success: true };
}
