"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPracticeId } from "@/lib/practice";
import { taskSchema, taskCommentSchema } from "@/lib/validators";
import type {
  MyTaskItem,
  Profile,
  Task,
  TaskAssignment,
  TaskComment,
  TaskPriority,
  TaskStatus,
} from "@/lib/types";

const PROFILE_FIELDS = "id, full_name, avatar_url, avatar_color";

async function requireAdmin() {
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

  return { supabase, user, isAdmin: profile?.role === "admin" };
}

// ============================================================
// Read
// ============================================================

/**
 * Members who can be assigned tasks. Unlike `getPracticeMembers` (messaging),
 * this INCLUDES the caller — admins routinely assign work to themselves as
 * their own todo list.
 */
export async function getAssignableMembers(): Promise<Profile[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const practiceId = await getCurrentPracticeId(supabase);

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("practice_id", practiceId)
    .eq("is_active", true)
    .order("full_name");

  return (data as Profile[]) ?? [];
}

/** Tasks assigned to the current user, with their own assignment row pulled out. */
export async function getMyTasks(): Promise<MyTaskItem[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Pull all assignments for me, then load each parent task + co-assignees
  const { data: myAssignments } = await supabase
    .from("task_assignments")
    .select("*")
    .eq("profile_id", user.id)
    .order("updated_at", { ascending: false });

  const assignments = (myAssignments ?? []) as TaskAssignment[];
  if (assignments.length === 0) return [];

  const taskIds = assignments.map((a) => a.task_id);

  const [{ data: tasksData }, { data: allAssignments }, { data: commentCounts }] =
    await Promise.all([
      supabase
        .from("tasks")
        .select(`*, creator:profiles!tasks_created_by_fkey(${PROFILE_FIELDS})`)
        .in("id", taskIds),
      supabase
        .from("task_assignments")
        .select(`*, profile:profiles(${PROFILE_FIELDS})`)
        .in("task_id", taskIds),
      supabase
        .from("task_comments")
        .select("task_id")
        .in("task_id", taskIds),
    ]);

  const tasks = (tasksData ?? []) as Task[];
  const assignmentsAll = (allAssignments ?? []) as TaskAssignment[];

  const commentCountByTask = new Map<string, number>();
  for (const row of (commentCounts ?? []) as { task_id: string }[]) {
    commentCountByTask.set(row.task_id, (commentCountByTask.get(row.task_id) ?? 0) + 1);
  }

  return assignments
    .map((mine) => {
      const task = tasks.find((t) => t.id === mine.task_id);
      if (!task) return null;
      const peers = assignmentsAll.filter(
        (a) => a.task_id === mine.task_id && a.profile_id !== user.id
      );
      return {
        task,
        assignment: mine,
        coAssignees: peers,
        comment_count: commentCountByTask.get(task.id) ?? 0,
      } satisfies MyTaskItem;
    })
    .filter((x): x is MyTaskItem => x !== null);
}

/** Count of "active" assignments for the current user — used for the header badge. */
export async function getMyActiveTaskCount(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count } = await supabase
    .from("task_assignments")
    .select("*", { count: "exact", head: true })
    .eq("profile_id", user.id)
    .in("status", ["assigned", "in_progress"]);

  return count ?? 0;
}

/** Admin view: every task in the practice with all its assignments. */
export async function getAllTasks(): Promise<Task[]> {
  const { supabase, isAdmin } = await requireAdmin();
  if (!isAdmin) throw new Error("Admin access required");

  const { data } = await supabase
    .from("tasks")
    .select(
      `*,
       creator:profiles!tasks_created_by_fkey(${PROFILE_FIELDS}),
       assignments:task_assignments(*, profile:profiles(${PROFILE_FIELDS})),
       task_comments(count)`
    )
    .order("updated_at", { ascending: false });

  return (
    (data as (Task & { task_comments?: { count: number }[] })[])?.map((t) => ({
      ...t,
      comment_count: t.task_comments?.[0]?.count ?? 0,
    })) ?? []
  );
}

export async function getTaskComments(taskId: string): Promise<TaskComment[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data } = await supabase
    .from("task_comments")
    .select(`*, profile:profiles(${PROFILE_FIELDS})`)
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });

  return (data as TaskComment[]) ?? [];
}

// ============================================================
// Create / update / delete
// ============================================================

export async function createTask(input: {
  title: string;
  description?: string | null;
  due_date?: string | null;
  priority: TaskPriority;
  assignee_ids: string[];
}) {
  const { supabase, user, isAdmin } = await requireAdmin();
  if (!isAdmin) return { error: "Admin access required" };

  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const practiceId = await getCurrentPracticeId(supabase);

  const { data: task, error: insertError } = await supabase
    .from("tasks")
    .insert({
      title: parsed.data.title.trim(),
      description: parsed.data.description?.trim() || null,
      due_date: parsed.data.due_date || null,
      priority: parsed.data.priority,
      created_by: user.id,
      practice_id: practiceId,
    })
    .select("id")
    .single();

  if (insertError || !task) {
    return { error: insertError?.message ?? "Could not create task" };
  }

  const assignmentRows = parsed.data.assignee_ids.map((profileId) => ({
    task_id: task.id,
    profile_id: profileId,
    practice_id: practiceId,
  }));

  const { error: assignmentError } = await supabase
    .from("task_assignments")
    .insert(assignmentRows);

  if (assignmentError) {
    // Best-effort cleanup so we don't leave a task with no assignees
    await supabase.from("tasks").delete().eq("id", task.id);
    return { error: assignmentError.message };
  }

  revalidatePath("/tasks");
  revalidatePath("/admin/tasks");
  return { success: true, taskId: task.id };
}

export async function updateTask(
  id: string,
  input: {
    title: string;
    description?: string | null;
    due_date?: string | null;
    priority: TaskPriority;
    assignee_ids: string[];
  }
) {
  const { supabase, isAdmin } = await requireAdmin();
  if (!isAdmin) return { error: "Admin access required" };

  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const practiceId = await getCurrentPracticeId(supabase);

  const { error: updateError } = await supabase
    .from("tasks")
    .update({
      title: parsed.data.title.trim(),
      description: parsed.data.description?.trim() || null,
      due_date: parsed.data.due_date || null,
      priority: parsed.data.priority,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) return { error: updateError.message };

  // Reconcile assignees: keep existing rows for assignees still present
  // (preserves their status/comments), insert new ones, delete removed ones.
  const { data: existing } = await supabase
    .from("task_assignments")
    .select("profile_id")
    .eq("task_id", id);

  const existingIds = new Set((existing ?? []).map((r) => r.profile_id));
  const desiredIds = new Set(parsed.data.assignee_ids);

  const toAdd = [...desiredIds].filter((pid) => !existingIds.has(pid));
  const toRemove = [...existingIds].filter((pid) => !desiredIds.has(pid));

  if (toAdd.length > 0) {
    await supabase.from("task_assignments").insert(
      toAdd.map((pid) => ({
        task_id: id,
        profile_id: pid,
        practice_id: practiceId,
      }))
    );
  }
  if (toRemove.length > 0) {
    await supabase
      .from("task_assignments")
      .delete()
      .eq("task_id", id)
      .in("profile_id", toRemove);
  }

  revalidatePath("/tasks");
  revalidatePath("/admin/tasks");
  return { success: true };
}

export async function deleteTask(id: string) {
  const { supabase, isAdmin } = await requireAdmin();
  if (!isAdmin) return { error: "Admin access required" };

  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/tasks");
  revalidatePath("/admin/tasks");
  return { success: true };
}

// ============================================================
// Status transitions
// ============================================================

/**
 * Update the caller's own assignment status. Used for the satisfying
 * cross-off: assignee marks themselves submitted. Admin uses this same
 * action to advance someone else's row.
 */
export async function setAssignmentStatus(
  assignmentId: string,
  status: TaskStatus,
  reviewNote?: string | null
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const update: Record<string, unknown> = {
    status,
  };

  if (status === "submitted") {
    // Stamp the moment the assignee finishes. Preserved on later approve.
    update.completed_at = new Date().toISOString();
  } else if (status === "approved") {
    // Approval doesn't touch completed_at — that records when the work
    // was finished, not when admin signed off (approved_at).
    update.approved_at = new Date().toISOString();
  } else if (status === "in_progress" || status === "assigned") {
    // Bouncing back from submitted/approved.
    update.completed_at = null;
    update.approved_at = null;
  }

  if (reviewNote !== undefined) {
    update.review_note = reviewNote;
  }

  const { error } = await supabase
    .from("task_assignments")
    .update(update)
    .eq("id", assignmentId);

  if (error) return { error: error.message };

  revalidatePath("/tasks");
  revalidatePath("/admin/tasks");
  return { success: true };
}

// ============================================================
// Comments
// ============================================================

export async function addTaskComment(taskId: string, message: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const parsed = taskCommentSchema.safeParse({ message });
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const practiceId = await getCurrentPracticeId(supabase);

  const { error } = await supabase.from("task_comments").insert({
    task_id: taskId,
    profile_id: user.id,
    practice_id: practiceId,
    message: parsed.data.message.trim(),
  });

  if (error) return { error: error.message };

  revalidatePath("/tasks");
  revalidatePath("/admin/tasks");
  return { success: true };
}
