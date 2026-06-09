"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveRecipientByCode } from "@/lib/survey/public";
import { surveySubmissionSchema } from "@/lib/validators";

/**
 * Public, UNAUTHENTICATED survey submission. Reaches the DB via the service
 * role. Everything trusted (practice_id, recipient_id, patient_id) is
 * re-resolved server-side from the opaque code — the client only supplies the
 * code and its answers.
 */
export async function submitSurveyResponse(input: {
  code: string;
  answers: Record<string, unknown>;
}) {
  const parsed = surveySubmissionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid submission" };
  }

  const r = await resolveRecipientByCode(parsed.data.code);
  if (!r) return { error: "This survey link is not valid." };
  if (r.respondedAt) {
    return { error: "This survey has already been completed. Thank you!" };
  }
  if (r.campaignStatus !== "active") {
    return { error: "This survey is no longer accepting responses." };
  }

  const answers = parsed.data.answers;

  // Required-question check (server-side, against the campaign's real schema).
  for (const q of r.questions) {
    if (!q.required) continue;
    const v = answers[q.id];
    const empty =
      v === undefined ||
      v === null ||
      (typeof v === "string" && v.trim() === "") ||
      (Array.isArray(v) && v.length === 0);
    if (empty) {
      return { error: `Please answer: ${q.label}` };
    }
  }

  // Denormalize the referral source for cheap aggregation, if present.
  const refQ = r.questions.find((q) => q.type === "referral_source");
  let referralSource: string | null = null;
  if (refQ) {
    const v = answers[refQ.id];
    if (typeof v === "string") referralSource = v;
    else if (Array.isArray(v)) referralSource = v.join(", ");
  }

  const supabase = createAdminClient();

  const { error: insertError } = await supabase.from("survey_responses").insert({
    practice_id: r.practiceId,
    campaign_id: r.campaignId,
    recipient_id: r.recipientId,
    patient_id: r.patientId,
    answers,
    referral_source: referralSource,
  });

  if (insertError) {
    // Unique violation on recipient_id → already submitted (race / double-tap).
    if (insertError.code === "23505") {
      return { error: "This survey has already been completed. Thank you!" };
    }
    return { error: "Could not save your response. Please try again." };
  }

  // Stamp the recipient as responded (does not touch the credit ledger —
  // the credit was promised when the letter was sent).
  await supabase
    .from("survey_recipients")
    .update({ responded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", r.recipientId);

  revalidatePath("/admin/surveys");
  return { success: true };
}
