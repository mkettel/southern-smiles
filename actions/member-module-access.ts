"use server";

import { redirect } from "next/navigation";
import { requireWorkspaceModule } from "@/actions/workspace-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceHomeHref, type ModuleKey } from "@/lib/workspace-access";

async function getMemberModuleContext(moduleKey: ModuleKey) {
  const workspaceAccess = await requireWorkspaceModule(moduleKey);
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { allowed: false, workspaceAccess } as const;

  const { data: profile } = await client
    .from("profiles")
    .select("practice_id, role, is_active")
    .eq("id", user.id)
    .single();
  if (!profile?.practice_id || !profile.is_active) {
    return { allowed: false, workspaceAccess } as const;
  }

  if (profile.role === "admin") {
    return {
      allowed: true,
      workspaceAccess,
      userId: user.id,
      practiceId: profile.practice_id as string,
    } as const;
  }

  const { data: grant } = await client
    .from("member_module_access")
    .select("enabled")
    .eq("practice_id", profile.practice_id)
    .eq("profile_id", user.id)
    .eq("module_key", moduleKey)
    .maybeSingle();

  return {
    allowed: grant?.enabled === true,
    workspaceAccess,
    userId: user.id,
    practiceId: profile.practice_id as string,
  } as const;
}

export async function getCanAccessMemberModule(moduleKey: ModuleKey) {
  try {
    return (await getMemberModuleContext(moduleKey)).allowed;
  } catch {
    return false;
  }
}

export async function requireMemberModuleAccess(moduleKey: ModuleKey) {
  const context = await getMemberModuleContext(moduleKey);
  if (!context.allowed || !context.userId || !context.practiceId) {
    throw new Error("Assigned feature access required");
  }
  return {
    supabase: createAdminClient(),
    userId: context.userId,
    practiceId: context.practiceId,
  };
}

export async function requireMemberModulePage(moduleKey: ModuleKey) {
  const context = await getMemberModuleContext(moduleKey);
  if (!context.allowed) {
    redirect(`${getWorkspaceHomeHref(context.workspaceAccess)}?feature=unavailable`);
  }
}
