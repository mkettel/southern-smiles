import { createHash } from "node:crypto";
import { calculateCondition } from "@/lib/conditions";
import { getCurrentWeekStart } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseCherryApprovalEmail,
  type CherryApprovalImportPayload,
} from "@/lib/cherry-financing";
import type { CherryFinancingApproval, Stat } from "@/lib/types";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface CherryApprovalImportResult {
  status: "imported" | "ignored";
  approval?: CherryFinancingApproval;
  weeklyTotalCents?: number;
  weekStart?: string;
  reason?: string;
}

export function buildCherryApprovalMessageId(payload: CherryApprovalImportPayload) {
  if (payload.messageId?.trim()) return payload.messageId.trim();
  const fingerprint = [
    payload.subject.trim(),
    payload.receivedAt.trim(),
    payload.body.trim(),
  ].join("\n--- cherry approval fingerprint ---\n");
  return `manual:${createHash("sha256").update(fingerprint).digest("hex")}`;
}

export async function importCherryApprovalForPractice({
  supabase,
  practiceId,
  importedBy,
  payload,
}: {
  supabase: AdminClient;
  practiceId: string;
  importedBy: string | null;
  payload: CherryApprovalImportPayload;
}): Promise<CherryApprovalImportResult> {
  const parsed = parseCherryApprovalEmail({
    messageId: buildCherryApprovalMessageId(payload),
    subject: payload.subject,
    body: payload.body,
    receivedAt: payload.receivedAt,
  });

  if (!parsed) {
    return {
      status: "ignored",
      reason: "This does not look like a Cherry approval email with an approved amount.",
    };
  }

  const { data, error } = await supabase
    .from("cherry_financing_approvals")
    .upsert(
      {
        practice_id: practiceId,
        source: parsed.source,
        source_message_id: parsed.sourceMessageId,
        approved_at: parsed.approvedAt,
        week_start: parsed.weekStart,
        amount_cents: parsed.amountCents,
        imported_by: importedBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "practice_id,source,source_message_id" },
    )
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  const weeklyTotalCents = await syncCherryApprovedFinancingStat(
    supabase,
    practiceId,
    parsed.weekStart,
    importedBy,
  );
  await syncNextCherryApprovedFinancingWeek(
    supabase,
    practiceId,
    parsed.weekStart,
    importedBy,
  );

  return {
    status: "imported",
    approval: data as CherryFinancingApproval,
    weeklyTotalCents,
    weekStart: parsed.weekStart,
  };
}

export async function syncCherryApprovedFinancingStat(
  supabase: AdminClient,
  practiceId: string,
  weekStart: string,
  actorId: string | null,
) {
  const { data: approvals } = await supabase
    .from("cherry_financing_approvals")
    .select("amount_cents")
    .eq("practice_id", practiceId)
    .eq("week_start", weekStart);

  const totalCents = ((approvals ?? []) as Pick<CherryFinancingApproval, "amount_cents">[])
    .reduce((sum, approval) => sum + approval.amount_cents, 0);
  const totalDollars = totalCents / 100;

  const { data: stats } = await supabase
    .from("stats")
    .select("id, name, stat_type, good_direction, post:posts(id, division:divisions(number))")
    .eq("practice_id", practiceId)
    .eq("is_active", true)
    .eq("stat_type", "dollar");

  const financingStats = ((stats ?? []) as unknown as (Stat & {
    post?: { id?: string | null; division?: { number?: number | null } | null } | null;
  })[])
    .filter((stat) =>
      stat.name.trim().toLowerCase() === "approved financing" &&
      stat.post?.division?.number === 2,
    )
    .map((stat) => ({
      id: stat.id,
      goodDirection: stat.good_direction,
      postId: stat.post?.id ?? null,
    }));

  if (!financingStats.length) return totalCents;

  for (const stat of financingStats) {
    const [{ data: previous }, { data: current }] = await Promise.all([
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
        .select("value, previous_value, profile_id")
        .eq("stat_id", stat.id)
        .eq("week_start", weekStart)
        .maybeSingle(),
    ]);

    const previousValue =
      previous?.value === null || previous?.value === undefined
        ? null
        : Number(previous.value);

    if (
      current &&
      Number(current.value) === totalDollars &&
      (current.previous_value === null || current.previous_value === undefined
        ? null
        : Number(current.previous_value)) === previousValue
    ) {
      continue;
    }

    const profileId =
      (await getAssignedProfileId(supabase, stat.postId)) ??
      (current?.profile_id as string | null | undefined) ??
      actorId ??
      (await getPracticeAdminProfileId(supabase, practiceId));

    if (!profileId) continue;

    const condition = calculateCondition(
      totalDollars,
      previousValue,
      stat.goodDirection,
    );

    await supabase.from("stat_entries").upsert(
      {
        stat_id: stat.id,
        profile_id: profileId,
        practice_id: practiceId,
        week_start: weekStart,
        value: totalDollars,
        calculated_value: totalDollars,
        is_manual_override: false,
        previous_value: previousValue,
        percent_change: condition.percentChange,
        auto_condition: condition.condition,
        self_condition: condition.condition,
        final_condition: condition.condition,
        updated_by: actorId,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "stat_id,week_start" },
    );
  }

  return totalCents;
}

export async function syncCurrentCherryApprovedFinancingStat(
  supabase: AdminClient,
  practiceId: string,
  actorId: string | null,
) {
  return syncCherryApprovedFinancingStat(
    supabase,
    practiceId,
    getCurrentWeekStart(),
    actorId,
  );
}

export async function syncNextCherryApprovedFinancingWeek(
  supabase: AdminClient,
  practiceId: string,
  weekStart: string,
  actorId: string | null,
) {
  const { data: stats } = await supabase
    .from("stats")
    .select("id, name, stat_type, post:posts(id, division:divisions(number))")
    .eq("practice_id", practiceId)
    .eq("is_active", true)
    .eq("stat_type", "dollar");

  const financingStatIds = ((stats ?? []) as unknown as (Stat & {
    post?: { id?: string | null; division?: { number?: number | null } | null } | null;
  })[])
    .filter((stat) =>
      stat.name.trim().toLowerCase() === "approved financing" &&
      stat.post?.division?.number === 2,
    )
    .map((stat) => stat.id);

  if (!financingStatIds.length) return;

  const nextWeeks = new Set<string>();
  for (const statId of financingStatIds) {
    const { data: nextEntry } = await supabase
      .from("stat_entries")
      .select("week_start")
      .eq("stat_id", statId)
      .gt("week_start", weekStart)
      .order("week_start", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (nextEntry?.week_start) nextWeeks.add(nextEntry.week_start as string);
  }

  for (const nextWeekStart of nextWeeks) {
    await syncCherryApprovedFinancingStat(
      supabase,
      practiceId,
      nextWeekStart,
      actorId,
    );
  }
}

async function getAssignedProfileId(
  supabase: AdminClient,
  postId: string | null,
): Promise<string | null> {
  if (!postId) return null;
  const { data } = await supabase
    .from("employee_posts")
    .select("profile_id")
    .eq("post_id", postId)
    .order("assigned_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.profile_id as string | null | undefined) ?? null;
}

async function getPracticeAdminProfileId(
  supabase: AdminClient,
  practiceId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("practice_id", practiceId)
    .eq("role", "admin")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.id as string | null | undefined) ?? null;
}
