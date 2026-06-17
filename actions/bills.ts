"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWeekStart } from "@/lib/constants";
import { calculateCondition } from "@/lib/conditions";
import { billSchema, billVendorSchema } from "@/lib/validators";
import {
  buildBillsSummary,
  buildVendorSummaries,
  todayString,
} from "@/lib/bills";
import type {
  Bill,
  BillsDashboardData,
  BillStatus,
  BillVendor,
} from "@/lib/types";

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

async function ensureMiscVendor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  practiceId: string,
): Promise<BillVendor | null> {
  const { data: existing } = await supabase
    .from("bill_vendors")
    .select("*")
    .eq("practice_id", practiceId)
    .eq("is_misc", true)
    .maybeSingle();

  if (existing) return existing as BillVendor;

  const { data, error } = await supabase
    .from("bill_vendors")
    .insert({
      practice_id: practiceId,
      name: "Miscellaneous",
      is_misc: true,
    })
    .select("*")
    .single();

  // A concurrent render may have created the misc vendor first, tripping the
  // one-misc-per-practice unique index. Fall back to re-selecting it.
  if (error) {
    const { data: raced } = await supabase
      .from("bill_vendors")
      .select("*")
      .eq("practice_id", practiceId)
      .eq("is_misc", true)
      .maybeSingle();
    return (raced as BillVendor | null) ?? null;
  }

  return (data as BillVendor | null) ?? null;
}

async function syncBillsStat(
  supabase: Awaited<ReturnType<typeof createClient>>,
  practiceId: string,
  profileId: string,
) {
  const { data: bills } = await supabase
    .from("bills")
    .select("amount_cents")
    .eq("practice_id", practiceId)
    .eq("status", "unpaid");

  const totalDollars =
    ((bills ?? []) as Pick<Bill, "amount_cents">[]).reduce(
      (sum, bill) => sum + bill.amount_cents,
      0,
    ) / 100;

  const { data: stats } = await supabase
    .from("stats")
    .select("id, good_direction, post:posts(id, division:divisions(number))")
    .eq("practice_id", practiceId)
    .eq("is_active", true)
    .eq("stat_type", "dollar")
    .ilike("name", "Bills");

  const billsStat = (stats ?? []).find((stat) => {
    const post = stat.post as { division?: { number?: number } } | null;
    return post?.division?.number === 7;
  }) as
    | {
        id: string;
        good_direction: "up" | "down";
      }
    | undefined;

  if (!billsStat) return;

  const weekStart = getCurrentWeekStart();
  const { data: previous } = await supabase
    .from("stat_entries")
    .select("value")
    .eq("stat_id", billsStat.id)
    .lt("week_start", weekStart)
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  const previousValue =
    previous?.value === null || previous?.value === undefined
      ? null
      : Number(previous.value);
  const condition = calculateCondition(
    totalDollars,
    previousValue,
    billsStat.good_direction,
  );

  await supabase.from("stat_entries").upsert(
    {
      stat_id: billsStat.id,
      profile_id: profileId,
      practice_id: practiceId,
      week_start: weekStart,
      value: totalDollars,
      previous_value: previousValue,
      percent_change: condition.percentChange,
      auto_condition: condition.condition,
      final_condition: condition.condition,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stat_id,profile_id,week_start" },
  );
}

function revalidateBillsPaths() {
  revalidatePath("/dashboard");
  revalidatePath("/stats/[statId]", "page");
}

export async function getBillsDashboardData(): Promise<BillsDashboardData | null> {
  const { supabase, practiceId } = await requireAdmin();
  await ensureMiscVendor(supabase, practiceId);

  const [{ data: vendorsData }, { data: billsData }] = await Promise.all([
    supabase
      .from("bill_vendors")
      .select("*")
      .eq("practice_id", practiceId)
      .order("is_misc", { ascending: true })
      .order("name"),
    supabase
      .from("bills")
      .select("*, vendor:bill_vendors(*)")
      .eq("practice_id", practiceId)
      .order("due_date", { ascending: true }),
  ]);

  const vendors = (vendorsData ?? []) as BillVendor[];
  const bills = (billsData ?? []) as Bill[];

  return {
    vendors: buildVendorSummaries(vendors, bills),
    bills,
    summary: buildBillsSummary(bills),
  };
}

export async function createBillVendor(input: {
  name: string;
  notes?: string | null;
}) {
  const { supabase, practiceId } = await requireAdmin();
  const parsed = billVendorSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const { error } = await supabase.from("bill_vendors").insert({
    practice_id: practiceId,
    name: parsed.data.name,
    notes: parsed.data.notes?.trim() || null,
  });

  if (error) return { error: error.message };

  revalidateBillsPaths();
  return { success: true };
}

export async function updateBillVendor(
  id: string,
  input: {
    name: string;
    notes?: string | null;
  },
) {
  const { supabase } = await requireAdmin();
  const parsed = billVendorSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const { data: vendor } = await supabase
    .from("bill_vendors")
    .select("is_misc")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("bill_vendors")
    .update({
      name: vendor?.is_misc ? "Miscellaneous" : parsed.data.name,
      notes: parsed.data.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidateBillsPaths();
  return { success: true };
}

export async function createBill(input: {
  vendor_id: string;
  category: string;
  invoice_date: string;
  due_date: string;
  amount_cents: number;
  notes?: string | null;
  status?: BillStatus;
  paid_date?: string | null;
}) {
  const { supabase, user, practiceId } = await requireAdmin();
  const parsed = billSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const { error } = await supabase.from("bills").insert({
    practice_id: practiceId,
    ...parsed.data,
    notes: parsed.data.notes?.trim() || null,
    paid_date: parsed.data.status === "paid" ? parsed.data.paid_date : null,
  });

  if (error) return { error: error.message };

  await syncBillsStat(supabase, practiceId, user.id);
  revalidateBillsPaths();
  return { success: true };
}

export async function updateBill(
  id: string,
  input: {
    vendor_id: string;
    category: string;
    invoice_date: string;
    due_date: string;
    amount_cents: number;
    notes?: string | null;
    status?: BillStatus;
    paid_date?: string | null;
  },
) {
  const { supabase, user, practiceId } = await requireAdmin();
  const parsed = billSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const { error } = await supabase
    .from("bills")
    .update({
      ...parsed.data,
      notes: parsed.data.notes?.trim() || null,
      paid_date: parsed.data.status === "paid" ? parsed.data.paid_date : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { error: error.message };

  await syncBillsStat(supabase, practiceId, user.id);
  revalidateBillsPaths();
  return { success: true };
}

export async function markBillPaid(id: string) {
  const { supabase, user, practiceId } = await requireAdmin();

  const { error } = await supabase
    .from("bills")
    .update({
      status: "paid",
      paid_date: todayString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { error: error.message };

  await syncBillsStat(supabase, practiceId, user.id);
  revalidateBillsPaths();
  return { success: true };
}
