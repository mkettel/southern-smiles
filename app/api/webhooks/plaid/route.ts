import { NextResponse } from "next/server";
import { z } from "zod";
import {
  syncFinancialConnection,
  syncFinancialTransactions,
} from "@/lib/financial-sync";
import { verifyPlaidWebhook } from "@/lib/plaid-webhooks";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const webhookSchema = z.object({
  webhook_type: z.string().max(100),
  webhook_code: z.string().max(100),
  item_id: z.string().trim().min(1).max(300),
  error: z
    .object({
      error_code: z.string().max(200).nullable().optional(),
      error_message: z.string().max(1000).nullable().optional(),
    })
    .nullable()
    .optional(),
});

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 1_000_000) {
    return NextResponse.json({ error: "Webhook body is too large" }, { status: 413 });
  }
  const rawBody = await request.text();
  const verified = await verifyPlaidWebhook(
    rawBody,
    request.headers.get("plaid-verification"),
  );
  if (!verified) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = webhookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ received: true, ignored: true });
  }

  const supabase = createAdminClient();
  const { data: connection } = await supabase
    .from("financial_connections")
    .select("id, practice_id")
    .eq("provider", "plaid")
    .eq("provider_item_id", parsed.data.item_id)
    .neq("status", "disconnected")
    .maybeSingle();
  if (!connection) {
    return NextResponse.json({ received: true, ignored: true });
  }

  const webhookType = parsed.data.webhook_type.toUpperCase();
  const webhookCode = parsed.data.webhook_code.toUpperCase();

  if (webhookType === "ITEM" && webhookCode === "ERROR") {
    const errorCode = parsed.data.error?.error_code;
    const reconnectRequired =
      errorCode === "ITEM_LOGIN_REQUIRED" || errorCode === "ITEM_LOCKED";
    await supabase
      .from("financial_connections")
      .update({
        status: reconnectRequired ? "reconnect_required" : "error",
        last_error:
          parsed.data.error?.error_message ?? "Plaid reported a connection error",
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id)
      .eq("practice_id", connection.practice_id);
    return NextResponse.json({ received: true });
  }

  if (webhookType === "ITEM" && webhookCode === "PENDING_DISCONNECT") {
    await supabase
      .from("financial_connections")
      .update({
        status: "reconnect_required",
        last_error: "Bank consent is expiring and must be renewed.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id)
      .eq("practice_id", connection.practice_id);
    return NextResponse.json({ received: true });
  }

  const shouldSync =
    (webhookType === "LIABILITIES" && webhookCode === "DEFAULT_UPDATE") ||
    (webhookType === "ITEM" &&
      (webhookCode === "LOGIN_REPAIRED" ||
        webhookCode === "NEW_ACCOUNTS_AVAILABLE"));
  if (
    webhookType === "TRANSACTIONS" &&
    webhookCode === "SYNC_UPDATES_AVAILABLE"
  ) {
    try {
      await syncFinancialTransactions({
        supabase,
        connectionId: connection.id as string,
        practiceId: connection.practice_id as string,
      });
    } catch {
      // The transaction status records the error. The daily sync retries it.
    }
    return NextResponse.json({ received: true });
  }

  if (shouldSync) {
    try {
      await syncFinancialConnection({
        supabase,
        connectionId: connection.id as string,
        practiceId: connection.practice_id as string,
        actorId: null,
      });
    } catch {
      // The connection row records the actionable error. The daily sync retries it.
    }
  }

  return NextResponse.json({ received: true });
}
