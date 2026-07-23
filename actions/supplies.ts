"use server";

import { revalidatePath } from "next/cache";
import { format } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWeekStart } from "@/lib/constants";
import { isSupplyAccessPost } from "@/lib/supply-access";
import {
  buildSupplyBudgetSnapshots,
  getSupplyBudgetStatKind,
} from "@/lib/supply-budget-stats";
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

async function syncSupplyBudgetStats(
  practiceId: string,
  actorProfileId: string,
  workspace: SavedSupplyWorkspace,
) {
  const today = format(new Date(), "yyyy-MM-dd");
  const currentMonth = today.slice(0, 7);
  if (workspace.settings.budget_month !== currentMonth) return;

  const supabase = createAdminClient();
  const snapshots = buildSupplyBudgetSnapshots(workspace, today);
  const { data: stats } = await supabase
    .from("stats")
    .select("id, name, abbreviation, post:posts(id, title, division:divisions(number))")
    .eq("practice_id", practiceId)
    .eq("is_active", true)
    .eq("stat_type", "percentage");

  const managedStats = (stats ?? []).flatMap((stat) => {
    const typedStat = stat as unknown as Parameters<typeof getSupplyBudgetStatKind>[0] & {
      id: string;
      post?: { id?: string | null } | null;
    };
    const kind = getSupplyBudgetStatKind(typedStat);
    return kind ? [{ id: typedStat.id, postId: typedStat.post?.id ?? null, kind }] : [];
  });
  if (!managedStats.length) return;

  const weekStart = getCurrentWeekStart();
  for (const stat of managedStats) {
    const snapshot = snapshots[stat.kind];
    const [{ data: previous }, { data: current }, { data: assignment }] = await Promise.all([
      supabase
        .from("stat_entries")
        .select("value")
        .eq("stat_id", stat.id)
        .lt("week_start", weekStart)
        .order("week_start", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("stat_entries")
        .select("value, previous_value, profile_id, final_condition")
        .eq("stat_id", stat.id)
        .eq("week_start", weekStart)
        .limit(1)
        .maybeSingle(),
      stat.postId
        ? supabase
          .from("employee_posts")
          .select("profile_id")
          .eq("practice_id", practiceId)
          .eq("post_id", stat.postId)
          .limit(1)
          .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const previousValue = previous?.value === null || previous?.value === undefined
      ? null
      : Number(previous.value);
    const percentChange = previousValue && previousValue !== 0
      ? Math.round((((snapshot.utilizationPercent - previousValue) / Math.abs(previousValue)) * 100) * 100) / 100
      : 0;
    const profileId =
      (assignment as { profile_id?: string } | null)?.profile_id
      ?? current?.profile_id
      ?? actorProfileId;

    if (
      current
      && Number(current.value) === snapshot.utilizationPercent
      && (current.previous_value === null || current.previous_value === undefined
        ? null
        : Number(current.previous_value)) === previousValue
      && current.final_condition === snapshot.condition
    ) {
      continue;
    }

    await supabase.from("stat_entries").upsert(
      {
        stat_id: stat.id,
        profile_id: profileId,
        practice_id: practiceId,
        week_start: weekStart,
        value: snapshot.utilizationPercent,
        previous_value: previousValue,
        percent_change: percentChange,
        auto_condition: snapshot.condition,
        final_condition: snapshot.condition,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "stat_id,week_start" },
    );
  }

  revalidatePath("/dashboard");
  revalidatePath("/stats/[statId]", "page");
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
    if (saved.success) {
      const incomingPurchases = new Map(
        safeWorkspace.purchases.map((purchase) => [purchase.id, purchase]),
      );
      const changedExistingPurchase = saved.data.purchases.some((purchase) => {
        const incoming = incomingPurchases.get(purchase.id);
        return !incoming || JSON.stringify(incoming) !== JSON.stringify(purchase);
      });
      if (changedExistingPurchase) {
        return { error: "Completed purchases can only be removed by an administrator." };
      }
    }
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

  if (error) return { error: error.message };

  await syncSupplyBudgetStats(context.practiceId, context.userId, safeWorkspace);
  return { success: true };
}

export async function deleteSupplyPurchase(purchaseId: string) {
  const safePurchaseId = purchaseId.trim();
  if (!safePurchaseId || safePurchaseId.length > 200) {
    return { error: "That purchase could not be identified." };
  }

  const context = await getSupplyAccessContext();
  if (!context?.isAdmin) {
    return { error: "Only an administrator can remove a completed purchase." };
  }

  const { data, error: loadError } = await context.supabase
    .from("supply_workspaces")
    .select("workspace")
    .eq("practice_id", context.practiceId)
    .maybeSingle();

  if (loadError) return { error: loadError.message };

  const saved = supplyWorkspaceSchema.safeParse(data?.workspace);
  if (!saved.success) return { error: "The saved supply workspace is not valid." };

  const purchase = saved.data.purchases.find((entry) => entry.id === safePurchaseId);
  if (!purchase) return { error: "That purchase is no longer in the purchase log." };

  const updatedWorkspace: SavedSupplyWorkspace = {
    ...saved.data,
    purchases: saved.data.purchases.filter((entry) => entry.id !== safePurchaseId),
  };

  const { error: saveError } = await context.supabase.from("supply_workspaces").upsert({
    practice_id: context.practiceId,
    workspace: updatedWorkspace,
    updated_by: context.userId,
    updated_at: new Date().toISOString(),
  });

  if (saveError) return { error: saveError.message };

  await syncSupplyBudgetStats(context.practiceId, context.userId, updatedWorkspace);
  revalidatePath("/admin/supplies");
  return { success: true, purchase };
}
