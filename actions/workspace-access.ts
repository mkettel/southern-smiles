"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getCurrentPracticeId } from "@/lib/practice";
import {
  getWorkspaceHomeHref,
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
