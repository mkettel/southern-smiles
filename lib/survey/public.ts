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
       campaign:survey_campaigns(title, status, questions, credit_amount_cents, credit_expires_days)`
    )
    .eq("code", code)
    .maybeSingle();

  if (error || !data) return null;

  const campaign = data.campaign as unknown as {
    title: string;
    status: "draft" | "active" | "closed";
    questions: SurveyQuestion[];
    credit_amount_cents: number;
    credit_expires_days: number | null;
  } | null;

  if (!campaign) return null;

  return {
    recipientId: data.id,
    practiceId: data.practice_id,
    campaignId: data.campaign_id,
    patientId: data.patient_id,
    campaignTitle: campaign.title,
    campaignStatus: campaign.status,
    questions: Array.isArray(campaign.questions) ? campaign.questions : [],
    creditAmountCents: campaign.credit_amount_cents,
    creditExpiresDays: campaign.credit_expires_days,
    respondedAt: data.responded_at,
  };
}

/**
 * Stamp an open on a recipient: bump view_count and the first/last timestamps.
 * Best-effort and fire-and-forget — a failed write must never block the page
 * from rendering the form. Caller is responsible for bot filtering.
 */
async function recordSurveyView(recipientId: string): Promise<void> {
  try {
    const supabase = createAdminClient();
    const nowIso = new Date().toISOString();
    const { data } = await supabase
      .from("survey_recipients")
      .select("first_viewed_at, view_count")
      .eq("id", recipientId)
      .maybeSingle();
    await supabase
      .from("survey_recipients")
      .update({
        // Only set first_viewed_at on the very first open.
        first_viewed_at: data?.first_viewed_at ?? nowIso,
        last_viewed_at: nowIso,
        view_count: (data?.view_count ?? 0) + 1,
      })
      .eq("id", recipientId);
  } catch {
    // swallow — tracking is non-critical, never block the page
  }
}

/**
 * Build the narrow, safe view for the public survey page. Never leaks other
 * recipients, the practice, or the credit ledger beyond the promised amount.
 *
 * When `options.recordView` is true (the caller has decided this is a real
 * human open, not a scanner/prefetch), the open is stamped on the recipient
 * before returning — only on the "ok" path, so "opened" means the live form
 * was actually shown.
 */
export async function getPublicSurveyView(
  rawCode: string,
  options: { recordView?: boolean } = {}
): Promise<PublicSurveyView> {
  const r = await resolveRecipientByCode(rawCode);
  if (!r) return { status: "not_found" };
  if (r.respondedAt) return { status: "already_responded" };
  if (r.campaignStatus !== "active") return { status: "closed" };

  if (options.recordView) {
    await recordSurveyView(r.recipientId);
  }

  return {
    status: "ok",
    campaignTitle: r.campaignTitle,
    questions: r.questions,
    creditAmountCents: r.creditAmountCents,
  };
}
