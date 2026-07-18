"use server";

import { createClient } from "@/lib/supabase/server";
import { isSupplyAccessPost } from "@/lib/supply-access";
import { DEFAULT_SUPPLY_BUDGET_SETTINGS, type SavedSupplyWorkspace } from "@/lib/supply-ordering";
import { supplyWorkspaceSchema } from "@/lib/validators";

async function getSupplyAccessContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, practice_id")
    .eq("id", user.id)
    .single();

  if (!profile?.practice_id) return null;
  if (profile.role === "admin") {
    return { supabase, userId: user.id, practiceId: profile.practice_id, isAdmin: true };
  }

  const { data: assignments } = await supabase
    .from("employee_posts")
    .select("post:posts(title, division:divisions(number))")
    .eq("profile_id", user.id)
    .eq("practice_id", profile.practice_id);

  const canAccess = (assignments ?? []).some((assignment) =>
    isSupplyAccessPost(
      assignment.post as {
        title?: string | null;
        division?: { number?: number | null } | null;
      } | null,
    ),
  );

  return canAccess
    ? { supabase, userId: user.id, practiceId: profile.practice_id, isAdmin: false }
    : null;
}

export async function getCanAccessSupplies() {
  return Boolean(await getSupplyAccessContext());
}

export async function getSupplyWorkspace(): Promise<SavedSupplyWorkspace | null> {
  const context = await getSupplyAccessContext();
  if (!context) return null;

  const { data, error } = await context.supabase
    .from("supply_workspaces")
    .select("workspace")
    .eq("practice_id", context.practiceId)
    .maybeSingle();

  if (error) throw new Error(`Unable to load the supply workspace: ${error.message}`);
  if (!data) return null;

  const parsed = supplyWorkspaceSchema.safeParse(data.workspace);
  if (!parsed.success) throw new Error("The saved supply workspace is not valid.");
  return parsed.data;
}

export async function saveSupplyWorkspace(workspace: unknown) {
  const parsed = supplyWorkspaceSchema.safeParse(workspace);
  if (!parsed.success) return { error: "The supply workspace contains invalid data." };

  const context = await getSupplyAccessContext();
  if (!context) return { error: "You do not have access to supply ordering." };

  let safeWorkspace = parsed.data;
  if (!context.isAdmin) {
    const { data: existing, error: existingError } = await context.supabase
      .from("supply_workspaces")
      .select("workspace")
      .eq("practice_id", context.practiceId)
      .maybeSingle();

    if (existingError) return { error: existingError.message };
    const saved = supplyWorkspaceSchema.safeParse(existing?.workspace);
    safeWorkspace = {
      ...safeWorkspace,
      settings: saved.success ? saved.data.settings : DEFAULT_SUPPLY_BUDGET_SETTINGS,
    };
  }

  const { error } = await context.supabase.from("supply_workspaces").upsert({
    practice_id: context.practiceId,
    workspace: safeWorkspace,
    updated_by: context.userId,
    updated_at: new Date().toISOString(),
  });

  return error ? { error: error.message } : { success: true };
}
