"use server";

import { createClient } from "@/lib/supabase/server";

export interface SupplyInvoiceInboxRow {
  id: string;
  vendor_name: string;
  from_address: string;
  subject: string;
  received_at: string;
  status: string;
  has_supported_attachment: boolean;
  attachment_count: number;
}

function isMissingSupplyInvoiceSchema(
  error: { message?: string } | null | undefined,
) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    message.includes("could not find the table 'public.supply_invoice_events'") ||
    message.includes('relation "supply_invoice_events" does not exist')
  );
}

export async function getSupplyInvoiceInbox(): Promise<{
  rows: SupplyInvoiceInboxRow[];
  setupRequired: boolean;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") throw new Error("Admin access required");

  const { data, error } = await supabase
    .from("supply_invoice_events")
    .select(
      "id, vendor_name, from_address, subject, received_at, status, has_supported_attachment, attachment_count",
    )
    .order("received_at", { ascending: false })
    .limit(100);

  if (isMissingSupplyInvoiceSchema(error)) {
    return { rows: [], setupRequired: true };
  }
  if (error) throw new Error(error.message);

  return {
    rows: (data ?? []) as SupplyInvoiceInboxRow[],
    setupRequired: false,
  };
}
