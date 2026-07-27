import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import type { SupplyInvoiceAttachment } from "@/actions/supply-invoices";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeFilename(value: string | null) {
  return (value ?? "invoice.pdf")
    .replace(/[\r\n"]/g, "")
    .slice(0, 180);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const { id, attachmentId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Not authenticated", { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return new Response("Admin access required", { status: 403 });
  }

  const { data: invoice } = await supabase
    .from("supply_invoice_events")
    .select("resend_email_id, attachments")
    .eq("id", id)
    .maybeSingle();
  if (!invoice) return new Response("Invoice not found", { status: 404 });

  const attachments =
    (invoice.attachments ?? []) as SupplyInvoiceAttachment[];
  const attachment = attachments.find((item) => item.id === attachmentId);
  if (!attachment) return new Response("Attachment not found", { status: 404 });
  if (
    attachment.content_type !== "application/pdf" &&
    !attachment.filename?.toLowerCase().endsWith(".pdf")
  ) {
    return new Response("Unsupported attachment type", { status: 415 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return new Response("Attachment service unavailable", { status: 503 });
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.receiving.attachments.get({
    emailId: invoice.resend_email_id,
    id: attachmentId,
  });
  if (error || !data?.download_url) {
    return new Response("Unable to retrieve attachment", { status: 502 });
  }

  const upstream = await fetch(data.download_url, { cache: "no-store" });
  if (!upstream.ok || !upstream.body) {
    return new Response("Unable to download attachment", { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeFilename(attachment.filename)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
