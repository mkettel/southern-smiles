"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentWeekStart } from "@/lib/constants";
import { calculateCondition } from "@/lib/conditions";
import { billSchema, billVendorSchema } from "@/lib/validators";
import {
  buildBillsSummary,
  buildVendorSummaries,
  isBillsManagedStat,
  todayString,
} from "@/lib/bills";
import type {
  Bill,
  BillsDashboardData,
  BillStatus,
  BillVendor,
} from "@/lib/types";

async function canAccessBillsByAssignment(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profile: { role: string; practice_id: string | null } | null,
  userId: string,
) {
  if (profile?.role === "admin") return true;
  if (!profile?.practice_id) return false;

  const { data: assignments } = await supabase
    .from("employee_posts")
    .select("post:posts(title, division:divisions(number))")
    .eq("profile_id", userId);

  return Boolean(
    (assignments ?? []).some((assignment) => {
      const post = assignment.post as {
        title?: string | null;
        division?: { number?: number | null } | null;
      } | null;
      return (
        post?.division?.number === 3 &&
        post.title?.trim().toLowerCase() === "bills payment officer"
      );
    }),
  );
}

export async function getCanAccessBills() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, practice_id")
    .eq("id", user.id)
    .single();

  return canAccessBillsByAssignment(supabase, profile, user.id);
}

async function requireBillsAccess() {
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

  const canAccess = await canAccessBillsByAssignment(supabase, profile, user.id);
  if (!canAccess || !profile?.practice_id) {
    throw new Error("Bills access required");
  }

  return {
    supabase: createAdminClient(),
    user,
    practiceId: profile.practice_id as string,
  };
}

async function ensureMiscVendor(
  supabase: ReturnType<typeof createAdminClient>,
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
  supabase: ReturnType<typeof createAdminClient>,
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
    .select("id, name, stat_type, good_direction, post:posts(id, division:divisions(number))")
    .eq("practice_id", practiceId)
    .eq("is_active", true)
    .eq("stat_type", "dollar");

  const billsStats = (stats ?? []).filter((stat) =>
    isBillsManagedStat(stat as unknown as Parameters<typeof isBillsManagedStat>[0]),
  ) as {
    id: string;
    good_direction: "up" | "down";
  }[];

  if (!billsStats.length) return;

  const weekStart = getCurrentWeekStart();
  for (const billsStat of billsStats) {
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
      { onConflict: "stat_id,week_start" },
    );
  }
}

async function validateBillVendor(
  supabase: ReturnType<typeof createAdminClient>,
  practiceId: string,
  vendorId: string,
) {
  const { data: vendor } = await supabase
    .from("bill_vendors")
    .select("id")
    .eq("id", vendorId)
    .eq("practice_id", practiceId)
    .maybeSingle();

  return Boolean(vendor);
}

function revalidateBillsPaths() {
  revalidatePath("/dashboard");
  revalidatePath("/stats/[statId]", "page");
}

export async function getBillsDashboardData(): Promise<BillsDashboardData | null> {
  const { supabase, user, practiceId } = await requireBillsAccess();
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
  await syncBillsStat(supabase, practiceId, user.id);

  return {
    vendors: buildVendorSummaries(vendors, bills),
    bills,
    summary: buildBillsSummary(bills),
  };
}

export async function createBillVendor(input: {
  name: string;
  default_category?: string;
  notes?: string | null;
}) {
  const { supabase, practiceId } = await requireBillsAccess();
  const parsed = billVendorSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const { error } = await supabase.from("bill_vendors").insert({
    practice_id: practiceId,
    name: parsed.data.name,
    default_category: parsed.data.default_category,
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
    default_category?: string;
    notes?: string | null;
  },
) {
  const { supabase, practiceId } = await requireBillsAccess();
  const parsed = billVendorSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const { data: vendor } = await supabase
    .from("bill_vendors")
    .select("is_misc")
    .eq("id", id)
    .eq("practice_id", practiceId)
    .single();

  const { error } = await supabase
    .from("bill_vendors")
    .update({
      name: vendor?.is_misc ? "Miscellaneous" : parsed.data.name,
      default_category: parsed.data.default_category,
      notes: parsed.data.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("practice_id", practiceId);

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
  const { supabase, user, practiceId } = await requireBillsAccess();
  const parsed = billSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
  if (!(await validateBillVendor(supabase, practiceId, parsed.data.vendor_id))) {
    return { error: "Pick a valid vendor" };
  }

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
  const { supabase, user, practiceId } = await requireBillsAccess();
  const parsed = billSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
  if (!(await validateBillVendor(supabase, practiceId, parsed.data.vendor_id))) {
    return { error: "Pick a valid vendor" };
  }

  const { error } = await supabase
    .from("bills")
    .update({
      ...parsed.data,
      notes: parsed.data.notes?.trim() || null,
      paid_date: parsed.data.status === "paid" ? parsed.data.paid_date : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("practice_id", practiceId);

  if (error) return { error: error.message };

  await syncBillsStat(supabase, practiceId, user.id);
  revalidateBillsPaths();
  return { success: true };
}

export async function markBillPaid(id: string) {
  const { supabase, user, practiceId } = await requireBillsAccess();

  const { error } = await supabase
    .from("bills")
    .update({
      status: "paid",
      paid_date: todayString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("practice_id", practiceId);

  if (error) return { error: error.message };

  await syncBillsStat(supabase, practiceId, user.id);
  revalidateBillsPaths();
  return { success: true };
}
