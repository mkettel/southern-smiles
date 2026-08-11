"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentWeekStart } from "@/lib/constants";
import { cherryApprovalImportSchema } from "@/lib/validators";
import {
  importCherryApprovalForPractice,
  syncCherryApprovedFinancingStat,
  syncNextCherryApprovedFinancingWeek,
} from "@/lib/cherry-financing-sync";
import type { CherryFinancingApproval, Profile } from "@/lib/types";
import { requireWorkspaceModule } from "@/actions/workspace-access";

export interface CherryFinancingDashboardData {
  approvals: CherryFinancingApproval[];
  currentWeekStart: string;
  currentWeekTotalCents: number;
}

function isSetupMissing(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return Boolean(
    error &&
      (message.includes("cherry_financing_approvals") ||
        error.code === "PGRST204" ||
        error.code === "PGRST205"),
  );
}

async function requireAdmin() {
  await requireWorkspaceModule("approved_financing");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    throw new Error("Admin access required");
  }

  return {
    supabase: createAdminClient(),
    user,
    profile: profile as Profile,
    practiceId: profile.practice_id as string,
  };
}

export async function getCherryFinancingDashboardData(): Promise<CherryFinancingDashboardData | null> {
  const { supabase, practiceId } = await requireAdmin();

  const { data: recent, error } = await supabase
    .from("cherry_financing_approvals")
    .select("*, importer:profiles!cherry_financing_approvals_imported_by_fkey(id, full_name, avatar_url, avatar_color)")
    .eq("practice_id", practiceId)
    .order("approved_at", { ascending: false })
    .limit(50);

  if (isSetupMissing(error)) return null;
  if (error) throw new Error(error.message);

  const currentWeekStart = await getCurrentDashboardWeekStart(supabase, practiceId);
  const { data: currentWeekRows } = await supabase
    .from("cherry_financing_approvals")
    .select("amount_cents")
    .eq("practice_id", practiceId)
    .eq("week_start", currentWeekStart);

  const currentWeekTotalCents = ((currentWeekRows ?? []) as Pick<CherryFinancingApproval, "amount_cents">[])
    .reduce((sum, row) => sum + row.amount_cents, 0);

  return {
    approvals: (recent as CherryFinancingApproval[] | null) ?? [],
    currentWeekStart,
    currentWeekTotalCents,
  };
}

export async function importCherryApprovalEmail(input: unknown) {
  const { supabase, user, practiceId } = await requireAdmin();
  const parsed = cherryApprovalImportSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid Cherry email" };
  }

  try {
    const result = await importCherryApprovalForPractice({
      supabase,
      practiceId,
      importedBy: user.id,
      payload: parsed.data,
    });

    if (result.status === "ignored") {
      return { error: result.reason ?? "No Cherry approval amount found" };
    }

    revalidateCherryPaths();
    return {
      success: true,
      approval: result.approval,
      weeklyTotalCents: result.weeklyTotalCents,
      weekStart: result.weekStart,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not import Cherry approval",
    };
  }
}

export async function deleteCherryApproval(approvalId: string) {
  const { supabase, user, practiceId } = await requireAdmin();
  const { data: existing } = await supabase
    .from("cherry_financing_approvals")
    .select("id, week_start")
    .eq("practice_id", practiceId)
    .eq("id", approvalId)
    .maybeSingle();

  if (!existing) return { error: "Approval not found" };

  const { error } = await supabase
    .from("cherry_financing_approvals")
    .delete()
    .eq("id", approvalId)
    .eq("practice_id", practiceId);
  if (error) return { error: error.message };

  await syncCherryApprovedFinancingStat(
    supabase,
    practiceId,
    existing.week_start as string,
    user.id,
  );
  await syncNextCherryApprovedFinancingWeek(
    supabase,
    practiceId,
    existing.week_start as string,
    user.id,
  );

  revalidateCherryPaths();
  return { success: true };
}

async function getCurrentDashboardWeekStart(
  supabase: ReturnType<typeof createAdminClient>,
  practiceId: string,
) {
  const weekStart = getCurrentWeekStart();

  await syncCherryApprovedFinancingStat(supabase, practiceId, weekStart, null);
  return weekStart;
}

function revalidateCherryPaths() {
  revalidatePath("/admin/cherry-financing");
  revalidatePath("/dashboard");
  revalidatePath("/stats");
  revalidatePath("/stats/[statId]", "page");
}
