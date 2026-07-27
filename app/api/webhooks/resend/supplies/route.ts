import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { Resend, type EmailReceivedEvent } from "resend";
import {
  extractEmailAddress,
  extractForwardedSender,
  isExpectedSupplyRecipient,
  resolveSupplyVendor,
  validateSupplyAttachments,
} from "@/lib/supply-invoices";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_PRACTICE_SLUG = "ssmiles";

function missingConfiguration() {
  return NextResponse.json(
    { error: "Supply invoice webhook is not configured" },
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
  const webhookSecret = process.env.RESEND_SUPPLIES_WEBHOOK_SECRET;
  const inboundRecipient = process.env.SUPPLIES_INBOUND_RECIPIENT;
  if (!apiKey || !webhookSecret || !inboundRecipient) {
    return missingConfiguration();
  }

  const headers = webhookHeaders(request);
  if (!headers) {
    return NextResponse.json(
      { error: "Missing webhook signature" },
      { status: 400 },
    );
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
    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 400 },
    );
  }

  if (!isExpectedSupplyRecipient(event.data.to, inboundRecipient)) {
    return NextResponse.json({ ignored: true, reason: "recipient" });
  }

  const { data: receivedEmail, error: receivingError } =
    await resend.emails.receiving.get(event.data.email_id);
  if (receivingError || !receivedEmail) {
    console.error("Unable to retrieve supply invoice email", {
      emailId: event.data.email_id,
      error: receivingError?.message,
    });
    return NextResponse.json(
      { error: "Unable to retrieve email" },
      { status: 502 },
    );
  }

  if (!isExpectedSupplyRecipient(receivedEmail.to, inboundRecipient)) {
    return NextResponse.json({
      ignored: true,
      reason: "retrieved_recipient",
    });
  }

  let effectiveSender = receivedEmail.from;
  let vendor = resolveSupplyVendor(
    receivedEmail.from,
    receivedEmail.reply_to ?? [],
  );
  let isHistoricalForward = false;
  const trustedForwarder = process.env.SUPPLIES_TRUSTED_FORWARDER;
  if (
    !vendor &&
    trustedForwarder &&
    extractEmailAddress(receivedEmail.from) ===
      extractEmailAddress(trustedForwarder)
  ) {
    const forwardedSender = extractForwardedSender(receivedEmail.text ?? "");
    if (forwardedSender) {
      vendor = resolveSupplyVendor(forwardedSender);
      if (vendor) {
        effectiveSender = forwardedSender;
        isHistoricalForward = true;
      }
    }
  }
  if (!vendor) {
    return NextResponse.json({ ignored: true, reason: "unknown_vendor" });
  }

  const attachments = receivedEmail.attachments.map((attachment) => ({
    id: attachment.id,
    filename: attachment.filename,
    size: attachment.size,
    contentType: attachment.content_type,
  }));
  const attachmentValidation = validateSupplyAttachments(attachments);
  if (!attachmentValidation.accepted) {
    return NextResponse.json({
      ignored: true,
      reason: attachmentValidation.reason,
    });
  }

  const supabase = createAdminClient();
  const practiceSlug =
    process.env.SUPPLIES_PRACTICE_SLUG ?? DEFAULT_PRACTICE_SLUG;
  const { data: practice, error: practiceError } = await supabase
    .from("practices")
    .select("id")
    .eq("slug", practiceSlug)
    .maybeSingle();
  if (practiceError || !practice) {
    console.error("Unable to resolve supply invoice practice", {
      practiceSlug,
      error: practiceError?.message,
    });
    return NextResponse.json(
      { error: "Unable to resolve practice" },
      { status: 500 },
    );
  }

  const sourceMessageId =
    receivedEmail.message_id || event.data.message_id || receivedEmail.id;
  const invoiceEvent = {
    practice_id: practice.id,
    provider_event_id: headers.id,
    resend_email_id: receivedEmail.id,
    source_message_id: sourceMessageId,
    vendor_key: vendor.key,
    vendor_name: vendor.name,
    from_address: extractEmailAddress(effectiveSender),
    subject: receivedEmail.subject.slice(0, 500),
    received_at: receivedEmail.created_at,
    status_reason: isHistoricalForward ? "historical_manual_forward" : null,
    has_supported_attachment: attachmentValidation.hasSupportedAttachment,
    attachment_count: attachments.length,
    attachments: attachments.map((attachment) => ({
      id: attachment.id,
      filename: attachment.filename,
      size: attachment.size,
      content_type: attachment.contentType,
    })),
  };

  const { data, error } = await supabase
    .from("supply_invoice_events")
    .insert(invoiceEvent)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      const { data: existingByMessage } = await supabase
        .from("supply_invoice_events")
        .select("id")
        .eq("practice_id", practice.id)
        .eq("source_message_id", sourceMessageId)
        .maybeSingle();
      const { data: existingByEmail } = existingByMessage
        ? { data: null }
        : await supabase
            .from("supply_invoice_events")
            .select("id")
            .eq("practice_id", practice.id)
            .eq("resend_email_id", receivedEmail.id)
            .maybeSingle();
      return NextResponse.json({
        accepted: true,
        result: {
          inserted: false,
          event_id: existingByMessage?.id ?? existingByEmail?.id ?? null,
        },
      });
    }

    console.error("Unable to record supply invoice", {
      emailId: event.data.email_id,
      vendor: vendor.key,
      error: error.message,
    });
    return NextResponse.json(
      { error: "Unable to record supply invoice" },
      { status: 500 },
    );
  }

  revalidatePath("/admin/supply-invoices");

  return NextResponse.json({
    accepted: true,
    result: { inserted: true, event_id: data?.id ?? null },
  });
}
