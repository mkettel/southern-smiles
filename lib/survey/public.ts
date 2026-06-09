import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeSurveyCode } from "@/lib/survey/code";
import type { PublicSurveyView, SurveyQuestion } from "@/lib/types";

/**
 * Row resolved from a survey code via the service-role client. Internal —
 * never returned directly to the client. Use getPublicSurveyView() for the
 * narrow, safe shape sent to the anonymous page.
 */
export interface ResolvedRecipient {
  recipientId: string;
  practiceId: string;
  campaignId: string;
  patientId: string;
  patientFirstName: string;
  campaignTitle: string;
  campaignStatus: "draft" | "active" | "closed";
  questions: SurveyQuestion[];
  creditAmountCents: number;
  creditExpiresDays: number | null;
  respondedAt: string | null;
}

/**
 * Resolve a survey code to its recipient/campaign/patient using the service
 * role (anonymous visitors have no auth cookie, so RLS would block them).
 * Returns null when the code is unknown.
 */
export async function resolveRecipientByCode(
  rawCode: string
): Promise<ResolvedRecipient | null> {
  const code = normalizeSurveyCode(rawCode);
  if (!code) return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("survey_recipients")
    .select(
      `id, practice_id, campaign_id, patient_id, responded_at,
       patient:patients(first_name, full_name),
       campaign:survey_campaigns(title, status, questions, credit_amount_cents, credit_expires_days)`
    )
    .eq("code", code)
    .maybeSingle();

  if (error || !data) return null;

  const patient = data.patient as unknown as {
    first_name: string | null;
    full_name: string;
  } | null;
  const campaign = data.campaign as unknown as {
    title: string;
    status: "draft" | "active" | "closed";
    questions: SurveyQuestion[];
    credit_amount_cents: number;
    credit_expires_days: number | null;
  } | null;

  if (!campaign) return null;

  const firstName =
    patient?.first_name?.trim() ||
    patient?.full_name?.trim().split(/\s+/)[0] ||
    "there";

  return {
    recipientId: data.id,
    practiceId: data.practice_id,
    campaignId: data.campaign_id,
    patientId: data.patient_id,
    patientFirstName: firstName,
    campaignTitle: campaign.title,
    campaignStatus: campaign.status,
    questions: Array.isArray(campaign.questions) ? campaign.questions : [],
    creditAmountCents: campaign.credit_amount_cents,
    creditExpiresDays: campaign.credit_expires_days,
    respondedAt: data.responded_at,
  };
}

/**
 * Build the narrow, safe view for the public survey page. Never leaks other
 * recipients, the practice, or the credit ledger beyond the promised amount.
 */
export async function getPublicSurveyView(
  rawCode: string
): Promise<PublicSurveyView> {
  const r = await resolveRecipientByCode(rawCode);
  if (!r) return { status: "not_found" };
  if (r.respondedAt) return { status: "already_responded" };
  if (r.campaignStatus !== "active") return { status: "closed" };

  return {
    status: "ok",
    patientFirstName: r.patientFirstName,
    campaignTitle: r.campaignTitle,
    questions: r.questions,
    creditAmountCents: r.creditAmountCents,
  };
}
