import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { Resend, type EmailReceivedEvent } from "resend";
import {
  getCherryBusinessWeekStart,
  getCherryEmailBody,
  isExpectedCherryRecipient,
  isExpectedCherrySender,
  parseCherryApprovalEmail,
} from "@/lib/cherry-financing";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_PRACTICE_SLUG = "ssmiles";
const DEFAULT_CHERRY_SENDER = "support@withcherry.com";
const DEFAULT_AUTOMATION_START_WEEK = "2026-07-20";

function missingConfiguration() {
  return NextResponse.json(
    { error: "Cherry approval webhook is not configured" },
    { status: 503 },
  );
}

function webhookHeaders(request: Request) {
  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  return id && timestamp && signature ? { id, timestamp, signature } : null;
}

export async function POST(request: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  const webhookSecret = process.env.RESEND_CHERRY_WEBHOOK_SECRET;
  const inboundRecipient = process.env.CHERRY_INBOUND_RECIPIENT;
  if (!apiKey || !webhookSecret || !inboundRecipient) {
    return missingConfiguration();
  }

  const headers = webhookHeaders(request);
  if (!headers) {
    return NextResponse.json({ error: "Missing webhook signature" }, { status: 400 });
  }

  const rawBody = await request.text();
  const resend = new Resend(apiKey);
  let event: EmailReceivedEvent;
  try {
    const verified = resend.webhooks.verify({
      payload: rawBody,
      headers,
      webhookSecret,
    });
    if (verified.type !== "email.received") {
      return NextResponse.json({ ignored: true, reason: "event_type" });
    }
    event = verified;
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  if (
    !isExpectedCherryRecipient(event.data.to, inboundRecipient) ||
    !isExpectedCherrySender(
      event.data.from,
      process.env.CHERRY_APPROVAL_SENDER ?? DEFAULT_CHERRY_SENDER,
    )
  ) {
    return NextResponse.json({ ignored: true, reason: "sender_or_recipient" });
  }

  const { data: receivedEmail, error: receivingError } =
    await resend.emails.receiving.get(event.data.email_id);
  if (receivingError || !receivedEmail) {
    console.error("Unable to retrieve Cherry approval email", {
      emailId: event.data.email_id,
      error: receivingError?.message,
    });
    return NextResponse.json({ error: "Unable to retrieve email" }, { status: 502 });
  }

  if (
    !isExpectedCherryRecipient(receivedEmail.to, inboundRecipient) ||
    !isExpectedCherrySender(
      receivedEmail.from,
      process.env.CHERRY_APPROVAL_SENDER ?? DEFAULT_CHERRY_SENDER,
    )
  ) {
    return NextResponse.json({ ignored: true, reason: "retrieved_sender_or_recipient" });
  }

  const approval = parseCherryApprovalEmail({
    messageId: receivedEmail.message_id || event.data.email_id,
    subject: receivedEmail.subject,
    body: getCherryEmailBody(receivedEmail.text, receivedEmail.html),
    receivedAt: receivedEmail.created_at,
  });
  if (!approval) {
    return NextResponse.json({ ignored: true, reason: "not_an_approval" });
  }

  const weekStart = getCherryBusinessWeekStart(approval.approvedAt);
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("record_cherry_approval_event", {
    p_practice_slug:
      process.env.CHERRY_PRACTICE_SLUG ?? DEFAULT_PRACTICE_SLUG,
    p_source_message_id: approval.sourceMessageId,
    p_provider_event_id: headers.id,
    p_approved_at: approval.approvedAt,
    p_week_start: weekStart,
    p_amount_cents: approval.amountCents,
    p_automation_start_week:
      process.env.CHERRY_AUTOMATION_START_WEEK ??
      DEFAULT_AUTOMATION_START_WEEK,
  });

  if (error) {
    console.error("Unable to record Cherry approval", {
      emailId: event.data.email_id,
      weekStart,
      error: error.message,
    });
    return NextResponse.json({ error: "Unable to record approval" }, { status: 500 });
  }

  revalidatePath("/dashboard");
  revalidatePath("/stats");

  return NextResponse.json({ accepted: true, result: data });
}
