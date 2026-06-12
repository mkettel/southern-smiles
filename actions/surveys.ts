"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { calculateCondition } from "@/lib/conditions";
import { getCurrentWeekStart } from "@/lib/constants";
import { generateSurveyCode } from "@/lib/survey/code";
import { upsertAggregatedPatients } from "@/lib/survey/upsert-patients";
import {
  surveyCampaignSchema,
  patientImportRowSchema,
  redeemCreditSchema,
  importPatientDataSchema,
  patientFiltersSchema,
  campaignQuestionsSchema,
} from "@/lib/validators";
import type {
  AggregatedPatient,
  CampaignStats,
  Patient,
  PatientFilters,
  PatientListItem,
  PullQuote,
  ReferralAggregationItem,
  SurveyCampaign,
  SurveyQuestion,
  SurveyRecipient,
  SurveyResponse,
} from "@/lib/types";

/** Subtract N whole months from today, return YYYY-MM-DD. */
function monthsAgoISO(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

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
// Patients
// ============================================================

export async function getPatients(): Promise<Patient[]> {
  const { supabase } = await requireAdmin();
  const { data } = await supabase
    .from("patients")
    .select("*")
    .order("full_name");
  return (data as Patient[]) ?? [];
}

/**
 * Import a list of patients (parsed from CSV upstream). Dedupes within the
 * practice by external_ref when present; otherwise inserts. Returns counts.
 */
export async function importPatients(input: {
  rows: Array<{
    full_name: string;
    first_name?: string | null;
    phone?: string | null;
    email?: string | null;
    external_ref?: string | null;
  }>;
}) {
  const { supabase, practiceId } = await requireAdmin();

  if (!Array.isArray(input.rows) || input.rows.length === 0) {
    return { error: "No patients to import" };
  }
  if (input.rows.length > 5000) {
    return { error: "Too many rows in a single import (max 5000)" };
  }

  const parsedRows = [];
  for (const row of input.rows) {
    const parsed = patientImportRowSchema.safeParse(row);
    if (!parsed.success) continue; // skip malformed rows silently
    parsedRows.push(parsed.data);
  }
  if (parsedRows.length === 0) {
    return { error: "No valid rows found (need at least a name column)" };
  }

  // Existing external_refs in this practice → skip those for dedupe.
  const refs = parsedRows
    .map((r) => r.external_ref?.trim())
    .filter((r): r is string => !!r);
  const existingRefs = new Set<string>();
  if (refs.length > 0) {
    const { data: existing } = await supabase
      .from("patients")
      .select("external_ref")
      .eq("practice_id", practiceId)
      .in("external_ref", refs);
    for (const e of existing ?? []) {
      if (e.external_ref) existingRefs.add(e.external_ref);
    }
  }

  const toInsert = parsedRows
    .filter((r) => !(r.external_ref && existingRefs.has(r.external_ref.trim())))
    .map((r) => ({
      practice_id: practiceId,
      full_name: r.full_name.trim(),
      first_name:
        r.first_name?.trim() || r.full_name.trim().split(/\s+/)[0] || null,
      phone: r.phone?.trim() || null,
      email: r.email?.trim() || null,
      external_ref: r.external_ref?.trim() || null,
    }));

  let inserted = 0;
  if (toInsert.length > 0) {
    const { error, count } = await supabase
      .from("patients")
      .insert(toInsert, { count: "exact" });
    if (error) return { error: error.message };
    inserted = count ?? toInsert.length;
  }

  revalidatePath("/admin/surveys");
  return {
    success: true,
    inserted,
    skipped: parsedRows.length - toInsert.length,
  };
}

/**
 * Import aggregated patient records (from the smart importer). Upserts by
 * external_ref when present, else by name_key. Refreshes value/recency/
 * frequency metrics (the import is the authoritative snapshot) and fills
 * contact fields when provided (coalesce — never wipes existing contacts).
 */
export async function importPatientData(input: { records: AggregatedPatient[] }) {
  const { supabase, practiceId } = await requireAdmin();

  const parsed = importPatientDataSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid import data" };

  // Normalize Zod's optional/undefined fields to the strict AggregatedPatient shape.
  const records: AggregatedPatient[] = parsed.data.records.map((r) => ({
    full_name: r.full_name,
    first_name: r.first_name ?? null,
    name_key: r.name_key,
    email: r.email ?? null,
    phone: r.phone ?? null,
    external_ref: r.external_ref ?? null,
    total_collected_cents: r.total_collected_cents,
    visit_count: r.visit_count,
    first_seen: r.first_seen ?? null,
    last_seen: r.last_seen ?? null,
    attributes: r.attributes ?? {},
  }));

  const result = await upsertAggregatedPatients(supabase, practiceId, records);
  if ("error" in result) return { error: result.error };

  revalidatePath("/admin/surveys");
  revalidatePath("/admin/surveys/patients");
  return { success: true, ...result, skipped: 0 };
}

/**
 * Filtered, value-sorted patient list for segmentation. Each row carries the
 * campaign ids it's already enrolled in (to avoid double-enrolling).
 */
export async function getPatientsFiltered(
  filters: PatientFilters = {}
): Promise<PatientListItem[]> {
  const { supabase } = await requireAdmin();
  const parsed = patientFiltersSchema.safeParse(filters);
  const f = parsed.success ? parsed.data : {};

  let query = supabase
    .from("patients")
    .select("*")
    .order("total_collected_cents", { ascending: false })
    .limit(2000);

  if (f.search && f.search.trim()) {
    query = query.ilike("full_name", `%${f.search.trim()}%`);
  }
  if (typeof f.minValueCents === "number") {
    query = query.gte("total_collected_cents", f.minValueCents);
  }
  if (f.repeatOnly) {
    query = query.gt("visit_count", 1);
  }
  if (typeof f.lapsedMonths === "number") {
    // last_seen older than N months ago (reactivation candidates).
    query = query.lt("last_seen", monthsAgoISO(f.lapsedMonths));
  }
  if (typeof f.newWithinMonths === "number") {
    query = query.gte("first_seen", monthsAgoISO(f.newWithinMonths));
  }

  const { data } = await query;
  const patients = (data as Patient[]) ?? [];
  if (patients.length === 0) return [];

  // Attach enrolled-campaign ids.
  const ids = patients.map((p) => p.id);
  const { data: recipients } = await supabase
    .from("survey_recipients")
    .select("patient_id, campaign_id")
    .in("patient_id", ids);

  const enrolled = new Map<string, string[]>();
  for (const r of recipients ?? []) {
    const list = enrolled.get(r.patient_id) ?? [];
    list.push(r.campaign_id);
    enrolled.set(r.patient_id, list);
  }

  return patients.map((p) => ({
    ...p,
    enrolledCampaignIds: enrolled.get(p.id) ?? [],
  }));
}

/** Permanently remove patients from the practice's list. Any campaign
 *  enrollments, survey responses, and promised credits they have cascade
 *  away with them — there is no undo. */
export async function deletePatients(patientIds: string[]) {
  const { supabase } = await requireAdmin();
  const ids = [...new Set(patientIds)].filter(
    (id) => typeof id === "string" && id.length > 0
  );
  if (ids.length === 0) return { error: "No patients selected" };
  if (ids.length > 2000) return { error: "Too many patients at once" };

  const { error, count } = await supabase
    .from("patients")
    .delete({ count: "exact" })
    .in("id", ids);
  if (error) return { error: error.message };

  revalidatePath("/admin/surveys/patients");
  revalidatePath("/admin/surveys");
  return { success: true, removed: count ?? ids.length };
}

// ============================================================
// Campaigns
// ============================================================

export async function getCampaigns(): Promise<SurveyCampaign[]> {
  const { supabase } = await requireAdmin();
  const { data } = await supabase
    .from("survey_campaigns")
    .select("*")
    .order("created_at", { ascending: false });
  return (data as SurveyCampaign[]) ?? [];
}

export async function getCampaign(id: string): Promise<SurveyCampaign | null> {
  const { supabase } = await requireAdmin();
  const { data } = await supabase
    .from("survey_campaigns")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as SurveyCampaign) ?? null;
}

export async function createCampaign(input: {
  title: string;
  questions: SurveyQuestion[];
  credit_amount_cents?: number;
  credit_expires_days?: number | null;
}) {
  const { supabase, user, practiceId } = await requireAdmin();
  const parsed = surveyCampaignSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const { data, error } = await supabase
    .from("survey_campaigns")
    .insert({
      practice_id: practiceId,
      title: parsed.data.title,
      questions: parsed.data.questions,
      credit_amount_cents: parsed.data.credit_amount_cents,
      credit_expires_days: parsed.data.credit_expires_days ?? null,
      status: "draft",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/admin/surveys");
  return { success: true, id: data.id as string };
}

export async function updateCampaignQuestions(
  campaignId: string,
  questions: SurveyQuestion[]
) {
  const { supabase } = await requireAdmin();
  const parsed = campaignQuestionsSchema.safeParse(questions);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid questions" };
  }
  const { error } = await supabase
    .from("survey_campaigns")
    .update({ questions: parsed.data, updated_at: new Date().toISOString() })
    .eq("id", campaignId);
  if (error) return { error: error.message };

  revalidatePath(`/admin/surveys/${campaignId}`);
  return { success: true };
}

export async function setCampaignStatus(
  id: string,
  status: "draft" | "active" | "closed"
) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("survey_campaigns")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/surveys");
  revalidatePath(`/admin/surveys/${id}`);
  return { success: true };
}

export async function renameCampaign(id: string, title: string) {
  const { supabase } = await requireAdmin();
  const trimmed = title.trim();
  if (!trimmed) return { error: "Title can't be empty" };
  if (trimmed.length > 200) return { error: "Title must be under 200 characters" };

  const { error } = await supabase
    .from("survey_campaigns")
    .update({ title: trimmed, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/surveys");
  revalidatePath(`/admin/surveys/${id}`);
  return { success: true, title: trimmed };
}

/** Permanently delete a campaign. Recipients, responses, and any promised
 *  (unredeemed) credits cascade away with it — there is no undo. */
export async function deleteCampaign(id: string) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("survey_campaigns")
    .delete()
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/surveys");
  return { success: true };
}

// ============================================================
// Recipients (unique codes) + batch send
// ============================================================

export async function getCampaignRecipients(
  campaignId: string
): Promise<SurveyRecipient[]> {
  const { supabase } = await requireAdmin();
  const { data } = await supabase
    .from("survey_recipients")
    .select("*, patient:patients(*)")
    .eq("campaign_id", campaignId)
    .order("created_at");
  return (data as SurveyRecipient[]) ?? [];
}

/**
 * Mint unique survey codes for patients in a campaign. Without patientIds it
 * enrolls every practice patient not already in the campaign. Insert-and-retry
 * guards against the (astronomically unlikely) code collision.
 */
export async function generateRecipients(
  campaignId: string,
  patientIds?: string[]
) {
  const { supabase, practiceId } = await requireAdmin();

  // Resolve the target patient set.
  let targetPatientIds: string[];
  if (patientIds && patientIds.length > 0) {
    targetPatientIds = patientIds;
  } else {
    const { data: patients } = await supabase
      .from("patients")
      .select("id")
      .eq("practice_id", practiceId);
    targetPatientIds = (patients ?? []).map((p) => p.id);
  }
  if (targetPatientIds.length === 0) {
    return { error: "No patients to enroll. Import patients first." };
  }

  // Skip patients already enrolled in this campaign.
  const { data: existing } = await supabase
    .from("survey_recipients")
    .select("patient_id")
    .eq("campaign_id", campaignId);
  const already = new Set((existing ?? []).map((e) => e.patient_id));
  const fresh = targetPatientIds.filter((id) => !already.has(id));
  if (fresh.length === 0) {
    return { success: true, created: 0 };
  }

  let created = 0;
  // Insert in chunks; retry the whole chunk with fresh codes on a unique
  // collision (code is the only realistic conflict source here).
  const CHUNK = 200;
  for (let i = 0; i < fresh.length; i += CHUNK) {
    const slice = fresh.slice(i, i + CHUNK);
    let attempts = 0;
    while (attempts < 5) {
      const rows = slice.map((patientId) => ({
        practice_id: practiceId,
        campaign_id: campaignId,
        patient_id: patientId,
        code: generateSurveyCode(),
      }));
      const { error, count } = await supabase
        .from("survey_recipients")
        .insert(rows, { count: "exact" });
      if (!error) {
        created += count ?? slice.length;
        break;
      }
      if (error.code === "23505") {
        attempts++;
        continue; // regenerate codes and retry
      }
      return { error: error.message };
    }
  }

  revalidatePath(`/admin/surveys/${campaignId}`);
  return { success: true, created };
}

/**
 * Unenroll patients from a campaign by deleting their recipient rows. Only
 * removes recipients that haven't been sent or responded — sent letters and
 * collected responses (with their $50 credits) are preserved.
 */
export async function unenrollAll(campaignId: string) {
  const { supabase } = await requireAdmin();
  const { error, count } = await supabase
    .from("survey_recipients")
    .delete({ count: "exact" })
    .eq("campaign_id", campaignId)
    .is("sent_at", null)
    .is("responded_at", null);
  if (error) return { error: error.message };
  if (!count) {
    return { error: "Nothing to unenroll — sent/responded enrollments are kept." };
  }

  revalidatePath(`/admin/surveys/${campaignId}`);
  revalidatePath("/admin/surveys/patients");
  return { success: true, removed: count };
}

/**
 * Add a one-off custom person to a campaign for testing (not from the CSV /
 * patient import). Creates a patient with a null name_key so it stays separate
 * from import dedupe, enrolls them with a real survey code, and returns the
 * survey link so you can run the flow end-to-end.
 */
export async function addManualRecipient(
  campaignId: string,
  input: { fullName: string; email?: string | null }
) {
  const { supabase, practiceId } = await requireAdmin();
  const fullName = (input.fullName ?? "").trim();
  if (!fullName) return { error: "Enter a name" };

  const { data: patient, error: pErr } = await supabase
    .from("patients")
    .insert({
      practice_id: practiceId,
      full_name: fullName,
      first_name: fullName.split(/\s+/)[0],
      email: input.email?.trim() || null,
      attributes: { source: "manual" },
    })
    .select("id")
    .single();
  if (pErr || !patient) return { error: pErr?.message ?? "Could not add person" };

  let code = "";
  let inserted = false;
  for (let i = 0; i < 5; i++) {
    code = generateSurveyCode();
    const { error } = await supabase.from("survey_recipients").insert({
      practice_id: practiceId,
      campaign_id: campaignId,
      patient_id: patient.id,
      code,
    });
    if (!error) {
      inserted = true;
      break;
    }
    if (error.code === "23505") continue; // code collision — regenerate
    return { error: error.message };
  }
  if (!inserted) return { error: "Could not generate a unique code" };

  revalidatePath(`/admin/surveys/${campaignId}`);
  return { success: true, code, surveyPath: `/survey/${code}` };
}

/**
 * Unenroll a specific subset of patients from a campaign. Only removes
 * recipients that haven't been sent or responded.
 */
export async function unenrollPatients(campaignId: string, patientIds: string[]) {
  const { supabase } = await requireAdmin();
  if (!patientIds || patientIds.length === 0) {
    return { error: "No patients selected" };
  }
  const { error, count } = await supabase
    .from("survey_recipients")
    .delete({ count: "exact" })
    .eq("campaign_id", campaignId)
    .in("patient_id", patientIds)
    .is("sent_at", null)
    .is("responded_at", null);
  if (error) return { error: error.message };

  revalidatePath(`/admin/surveys/${campaignId}`);
  revalidatePath("/admin/surveys/patients");
  return { success: true, removed: count ?? 0 };
}

/**
 * "Send" a batch: stamp sent_at on un-sent recipients, promise the $50 credit,
 * and increment the Personalized Outflow (PO) stat for the current week.
 */
export async function sendBatch(campaignId: string) {
  const { supabase, user, practiceId } = await requireAdmin();

  const { data: campaign } = await supabase
    .from("survey_campaigns")
    .select("credit_amount_cents, credit_expires_days")
    .eq("id", campaignId)
    .single();
  if (!campaign) return { error: "Campaign not found" };

  // Recipients not yet sent.
  const { data: unsent } = await supabase
    .from("survey_recipients")
    .select("id")
    .eq("campaign_id", campaignId)
    .is("sent_at", null);

  const ids = (unsent ?? []).map((r) => r.id);
  if (ids.length === 0) {
    return { error: "Nothing to send — generate recipients first, or all are already sent." };
  }

  const nowIso = new Date().toISOString();
  let creditExpiresAt: string | null = null;
  if (campaign.credit_expires_days) {
    const d = new Date();
    d.setDate(d.getDate() + campaign.credit_expires_days);
    creditExpiresAt = d.toISOString().slice(0, 10);
  }

  const { error: updateError } = await supabase
    .from("survey_recipients")
    .update({
      sent_at: nowIso,
      credit_status: "promised",
      credit_amount_cents: campaign.credit_amount_cents,
      credit_expires_at: creditExpiresAt,
      updated_at: nowIso,
    })
    .in("id", ids);
  if (updateError) return { error: updateError.message };

  // Mark the campaign active so the public form accepts responses.
  await supabase
    .from("survey_campaigns")
    .update({ status: "active", updated_at: nowIso })
    .eq("id", campaignId)
    .eq("status", "draft");

  await incrementPersonalizedOutflow(supabase, practiceId, user.id, ids.length);

  revalidatePath("/admin/surveys");
  revalidatePath(`/admin/surveys/${campaignId}`);
  revalidatePath("/dashboard");
  return { success: true, sent: ids.length };
}

/**
 * Add `count` letters to this week's Personalized Outflow (abbreviation 'PO')
 * stat entry. Reuses the upsert + condition pattern from stat submission.
 * Skips gracefully if the practice has no PO stat.
 */
async function incrementPersonalizedOutflow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  practiceId: string,
  fallbackProfileId: string,
  count: number
) {
  const { data: stat } = await supabase
    .from("stats")
    .select("id, post_id, good_direction")
    .eq("practice_id", practiceId)
    .eq("abbreviation", "PO")
    .eq("is_active", true)
    .maybeSingle();
  if (!stat) return; // no PO stat configured — nothing to do

  // Owning employee for the PO post (fallback to the acting admin).
  const { data: assignment } = await supabase
    .from("employee_posts")
    .select("profile_id")
    .eq("post_id", stat.post_id)
    .limit(1)
    .maybeSingle();
  const profileId = assignment?.profile_id ?? fallbackProfileId;

  const week = getCurrentWeekStart();

  // Existing current-week entry → add to it, keep its previous_value.
  const { data: current } = await supabase
    .from("stat_entries")
    .select("value, previous_value")
    .eq("stat_id", stat.id)
    .eq("profile_id", profileId)
    .eq("week_start", week)
    .maybeSingle();

  let baseValue = 0;
  let previousValue: number | null = null;
  if (current) {
    baseValue = Number(current.value);
    previousValue =
      current.previous_value === null ? null : Number(current.previous_value);
  } else {
    const { data: prior } = await supabase
      .from("stat_entries")
      .select("value")
      .eq("stat_id", stat.id)
      .eq("profile_id", profileId)
      .lt("week_start", week)
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle();
    previousValue = prior ? Number(prior.value) : null;
  }

  const newValue = baseValue + count;
  const result = calculateCondition(
    newValue,
    previousValue,
    stat.good_direction ?? "up"
  );

  await supabase.from("stat_entries").upsert(
    {
      stat_id: stat.id,
      profile_id: profileId,
      week_start: week,
      value: newValue,
      previous_value: previousValue,
      percent_change: result.percentChange,
      auto_condition: result.condition,
      updated_at: new Date().toISOString(),
      practice_id: practiceId,
    },
    { onConflict: "stat_id,profile_id,week_start" }
  );
}

// ============================================================
// Credit ledger
// ============================================================

export async function markCreditRedeemed(recipientId: string) {
  const { supabase, user } = await requireAdmin();
  const parsed = redeemCreditSchema.safeParse({ recipient_id: recipientId });
  if (!parsed.success) return { error: "Invalid recipient" };

  const { error } = await supabase
    .from("survey_recipients")
    .update({
      credit_status: "redeemed",
      credit_redeemed_at: new Date().toISOString(),
      credit_redeemed_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", recipientId);
  if (error) return { error: error.message };

  revalidatePath("/admin/surveys");
  return { success: true };
}

// ============================================================
// Insights
// ============================================================

export async function getCampaignStats(
  campaignId: string
): Promise<CampaignStats | null> {
  const { supabase } = await requireAdmin();

  const { data: campaign } = await supabase
    .from("survey_campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return null;

  const { data: recipients } = await supabase
    .from("survey_recipients")
    .select("sent_at, first_viewed_at, credit_status, credit_amount_cents")
    .eq("campaign_id", campaignId);

  const { count: responseCount } = await supabase
    .from("survey_responses")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId);

  const recs = recipients ?? [];
  const sentCount = recs.filter((r) => r.sent_at).length;
  const openedCount = recs.filter((r) => r.first_viewed_at).length;
  const responses = responseCount ?? 0;

  let creditPromisedCents = 0;
  let creditRedeemedCents = 0;
  for (const r of recs) {
    const amt = r.credit_amount_cents ?? 0;
    if (r.credit_status === "promised") creditPromisedCents += amt;
    if (r.credit_status === "redeemed") creditRedeemedCents += amt;
  }

  return {
    campaign: campaign as SurveyCampaign,
    recipientCount: recs.length,
    sentCount,
    openedCount,
    responseCount: responses,
    openRate: sentCount > 0 ? openedCount / sentCount : 0,
    responseRate: sentCount > 0 ? responses / sentCount : 0,
    creditPromisedCents,
    creditRedeemedCents,
    creditOutstandingCents: creditPromisedCents,
  };
}

export async function getResponseFeed(
  campaignId?: string,
  limit = 100
): Promise<SurveyResponse[]> {
  const { supabase } = await requireAdmin();
  let query = supabase
    .from("survey_responses")
    .select("*, patient:patients(id, full_name, first_name)")
    .order("submitted_at", { ascending: false })
    .limit(limit);
  if (campaignId) query = query.eq("campaign_id", campaignId);
  const { data } = await query;
  return (data as SurveyResponse[]) ?? [];
}

export async function getReferralAggregation(
  campaignId?: string
): Promise<ReferralAggregationItem[]> {
  const { supabase } = await requireAdmin();
  let query = supabase
    .from("survey_responses")
    .select("referral_source")
    .not("referral_source", "is", null);
  if (campaignId) query = query.eq("campaign_id", campaignId);
  const { data } = await query;

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const src = (row.referral_source as string)?.trim();
    if (!src) continue;
    counts.set(src, (counts.get(src) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Pull free-text answers (the "why do you recommend us" gold) across a
 * campaign's text questions, paired with the patient name.
 */
export async function getPullQuotes(
  campaignId: string,
  limit = 50
): Promise<PullQuote[]> {
  const { supabase } = await requireAdmin();

  const { data: campaign } = await supabase
    .from("survey_campaigns")
    .select("questions")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return [];

  const textQuestions = (
    (campaign.questions as SurveyQuestion[]) ?? []
  ).filter((q) => q.type === "text");
  if (textQuestions.length === 0) return [];

  const { data: responses } = await supabase
    .from("survey_responses")
    .select("answers, submitted_at, patient:patients(full_name)")
    .eq("campaign_id", campaignId)
    .order("submitted_at", { ascending: false })
    .limit(limit);

  const quotes: PullQuote[] = [];
  for (const r of responses ?? []) {
    const answers = (r.answers as Record<string, unknown>) ?? {};
    const patient = r.patient as unknown as { full_name: string } | null;
    for (const q of textQuestions) {
      const v = answers[q.id];
      if (typeof v === "string" && v.trim()) {
        quotes.push({
          patientName: patient?.full_name ?? "A patient",
          questionLabel: q.label,
          text: v.trim(),
          submittedAt: r.submitted_at as string,
        });
      }
    }
  }
  return quotes;
}
