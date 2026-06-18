"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { divisionSchema, postSchema, statDefinitionSchema, departmentSchema, sectionSchema } from "@/lib/validators";
import type { ConditionName } from "@/lib/conditions";
import type { WeeklyFormula } from "@/lib/types";

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
  revalidatePath("/admin/organization");
  return { success: true };
}

export async function updateDivision(
  id: string,
  input: { number?: number; name?: string; executive?: string | null; vfp?: string | null; color?: string; is_private?: boolean }
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

  // Check if division has posts or departments
  const [{ count: postCount }, { count: deptCount }] = await Promise.all([
    supabase.from("posts").select("*", { count: "exact", head: true }).eq("division_id", id),
    supabase.from("departments").select("*", { count: "exact", head: true }).eq("division_id", id),
  ]);

  if ((postCount ?? 0) > 0) {
    return { error: "Cannot delete a division that has posts. Remove or reassign posts first." };
  }
  if ((deptCount ?? 0) > 0) {
    return { error: "Cannot delete a division that has departments. Remove departments first." };
  }

  const { error } = await supabase.from("divisions").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/employees");
  revalidatePath("/admin/organization");
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
  vfp?: string | null;
  division_id: string;
}) {
  const { supabase, practiceId } = await requireAdmin();
  const parsed = postSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const { error } = await supabase.from("posts").insert({ ...parsed.data, practice_id: practiceId });
  if (error) return { error: error.message };

  revalidatePath("/admin/organization");
  revalidatePath("/org-board");
  revalidatePath("/admin/employees");
  return { success: true };
}

export async function updatePost(
  id: string,
  input: { title?: string; vfp?: string | null; division_id?: string }
) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("posts")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/organization");
  revalidatePath("/org-board");
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

  revalidatePath("/admin/organization");
  revalidatePath("/org-board");
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

  const { error } = await supabase.from("stats").insert({
    ...parsed.data,
    practice_id: practiceId,
    weekly_formula: parsed.data.stat_type === "percentage" ? "average" : "sum",
    daily_tracking_enabled: true,
  });
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

export async function updateStatFormula(
  id: string,
  input: { weekly_formula: WeeklyFormula; formula_source_stat_id?: string | null },
) {
  const { supabase } = await requireAdmin();
  if (
    input.weekly_formula === "collections_per_staff" &&
    !input.formula_source_stat_id
  ) {
    return { error: "Choose the collections source stat" };
  }

  const { error } = await supabase
    .from("stats")
    .update({
      weekly_formula: input.weekly_formula,
      daily_tracking_enabled: input.weekly_formula !== "manual",
      formula_source_stat_id:
        input.weekly_formula === "collections_per_staff"
          ? input.formula_source_stat_id
          : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/stats");
  revalidatePath("/stats");
  return { success: true };
}

export async function setStatOverallCondition(
  id: string,
  condition: ConditionName | null,
) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("stats")
    .update({
      overall_condition: condition,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/stats/[statId]", "page");
  return { success: true };
}

export async function reorderStats(orderedIds: string[]) {
  const { supabase } = await requireAdmin();

  const updates = orderedIds.map((id, index) =>
    supabase
      .from("stats")
      .update({ display_order: index, updated_at: new Date().toISOString() })
      .eq("id", id)
  );
  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed?.error) return { error: failed.error.message };

  revalidatePath("/admin/stats");
  revalidatePath("/dashboard");
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

export async function toggleStatPrivacy(id: string, isPrivate: boolean) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("stats")
    .update({ is_private: isPrivate, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/stats");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function toggleDivisionPrivacy(id: string, isPrivate: boolean) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("divisions")
    .update({ is_private: isPrivate, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/organization");
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
  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Admin-initiated password reset. Sets a new password directly for a user
 * in the same practice, bypassing the current-password requirement. Used when
 * an employee is locked out — the admin hands them this temporary password and
 * they change it afterward from their profile page.
 *
 * Note: there is no way to read a user's existing password — it's stored only
 * as a one-way hash. This replaces it with a new one.
 */
export async function setTemporaryPassword(
  profileId: string,
  newPassword: string
) {
  const { supabase, practiceId } = await requireAdmin();

  const password = newPassword ?? "";
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters" };
  }
  if (password.length > 72) {
    return { error: "Password must be 72 characters or less" };
  }

  // Confirm the target user is in the admin's practice before touching auth.
  const { data: target } = await supabase
    .from("profiles")
    .select("id, email, practice_id")
    .eq("id", profileId)
    .single();

  if (!target || target.practice_id !== practiceId) {
    return { error: "Employee not found" };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(profileId, {
    password,
  });
  if (error) return { error: error.message };

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
  postVfp?: string | null;
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
    .insert({
      title: input.postTitle.trim(),
      vfp: input.postVfp?.trim() || null,
      division_id: input.divisionId,
      practice_id: practiceId,
    })
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

  revalidatePath("/admin/organization");
  revalidatePath("/org-board");
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

// ============================================================
// Departments
// ============================================================

export async function getDepartments() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("departments")
    .select("*, sections(*, post:posts(id, title))")
    .order("display_order")
    .order("display_order", { referencedTable: "sections" });
  return data ?? [];
}

export async function createDepartment(input: {
  name: string;
  director?: string | null;
  division_id: string;
  display_order?: number;
}) {
  const { supabase, practiceId } = await requireAdmin();
  const parsed = departmentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const { error } = await supabase.from("departments").insert({
    ...parsed.data,
    practice_id: practiceId,
  });
  if (error) return { error: error.message };

  revalidatePath("/admin/organization");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function updateDepartment(
  id: string,
  input: { name?: string; director?: string | null; division_id?: string; display_order?: number }
) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("departments")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/organization");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function deleteDepartment(id: string) {
  const { supabase } = await requireAdmin();

  // Check if department has sections
  const { count } = await supabase
    .from("sections")
    .select("*", { count: "exact", head: true })
    .eq("department_id", id);

  if ((count ?? 0) > 0) {
    return { error: "Cannot delete a department that has sections. Remove sections first." };
  }

  const { error } = await supabase.from("departments").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/organization");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function reorderDepartments(orderedIds: string[]) {
  const { supabase } = await requireAdmin();

  const updates = orderedIds.map((id, index) =>
    supabase
      .from("departments")
      .update({ display_order: index, updated_at: new Date().toISOString() })
      .eq("id", id)
  );
  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed?.error) return { error: failed.error.message };

  revalidatePath("/admin/organization");
  revalidatePath("/dashboard");
  return { success: true };
}

// ============================================================
// Sections
// ============================================================

export async function createSection(input: {
  name: string;
  assignee?: string | null;
  department_id: string;
  post_id?: string | null;
  responsibilities?: string[];
  display_order?: number;
}) {
  const { supabase, practiceId } = await requireAdmin();
  const parsed = sectionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const { error } = await supabase.from("sections").insert({
    ...parsed.data,
    practice_id: practiceId,
  });
  if (error) return { error: error.message };

  revalidatePath("/admin/organization");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function updateSection(
  id: string,
  input: {
    name?: string;
    assignee?: string | null;
    department_id?: string;
    post_id?: string | null;
    responsibilities?: string[];
    display_order?: number;
  }
) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("sections")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/organization");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function reorderSections(orderedIds: string[]) {
  const { supabase } = await requireAdmin();

  const updates = orderedIds.map((id, index) =>
    supabase
      .from("sections")
      .update({ display_order: index, updated_at: new Date().toISOString() })
      .eq("id", id)
  );
  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed?.error) return { error: failed.error.message };

  revalidatePath("/admin/organization");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function deleteSection(id: string) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("sections").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/organization");
  revalidatePath("/dashboard");
  return { success: true };
}
