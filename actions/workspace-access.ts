"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentPracticeId } from "@/lib/practice";
import {
  getWorkspaceHomeHref,
  isWorkspaceType,
  resolvePlanForWorkspaceType,
  resolveWorkspaceAccess,
  type ModuleKey,
  type WorkspaceAccess,
} from "@/lib/workspace-access";

export async function getWorkspaceAccess(): Promise<WorkspaceAccess> {
  const supabase = await createClient();

  try {
    const practiceId = await getCurrentPracticeId(supabase);
    const [productResult, overridesResult] = await Promise.all([
      supabase
        .from("practice_product_settings")
        .select("workspace_type, plan_key")
        .eq("practice_id", practiceId)
        .maybeSingle(),
      supabase
        .from("practice_module_overrides")
        .select("module_key, enabled")
        .eq("practice_id", practiceId),
    ]);

    return resolveWorkspaceAccess({
      workspaceType: productResult.data?.workspace_type,
      planKey: productResult.data?.plan_key,
      overrides: (overridesResult.data ?? []).map((override) => ({
        moduleKey: override.module_key,
        enabled: override.enabled,
      })),
    });
  } catch {
    return resolveWorkspaceAccess();
  }
}

export async function requireWorkspaceModule(moduleKey: ModuleKey) {
  const access = await getWorkspaceAccess();
  if (!access.modules[moduleKey]) {
    throw new Error("This feature is not enabled for your organization");
  }
  return access;
}

export async function requireAnyWorkspaceModule(moduleKeys: ModuleKey[]) {
  const access = await getWorkspaceAccess();
  if (!moduleKeys.some((moduleKey) => access.modules[moduleKey])) {
    throw new Error("This feature is not enabled for your organization");
  }
  return access;
}

export async function requireWorkspaceModulePage(moduleKey: ModuleKey) {
  const access = await getWorkspaceAccess();
  if (!access.modules[moduleKey]) {
    redirect(`${getWorkspaceHomeHref(access)}?feature=unavailable`);
  }
  return access;
}

export async function updateWorkspaceType(input: { workspaceType: string }) {
  if (!isWorkspaceType(input.workspaceType)) {
    return { error: "Choose a valid workspace type" } as const;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" } as const;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, practice_id")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin" || !profile.practice_id) {
    return { error: "Admin access required" } as const;
  }

  const { data: current, error: readError } = await supabase
    .from("practice_product_settings")
    .select("plan_key")
    .eq("practice_id", profile.practice_id)
    .maybeSingle();

  if (readError?.code === "42P01") {
    return {
      error:
        "Workspace settings are not set up yet. Apply the workspace entitlements migration first.",
    } as const;
  }

  const planKey = resolvePlanForWorkspaceType(input.workspaceType, current?.plan_key);

  const { error } = await supabase
    .from("practice_product_settings")
    .upsert(
      {
        practice_id: profile.practice_id,
        workspace_type: input.workspaceType,
        plan_key: planKey,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "practice_id" },
    );

  if (error) return { error: error.message } as const;

  revalidatePath("/", "layout");
  return { success: true, workspaceType: input.workspaceType, planKey } as const;
}
