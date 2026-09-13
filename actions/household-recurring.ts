"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMemberModuleAccess } from "@/actions/member-module-access";
import { shiftMonthKey } from "@/lib/household-finance";
import {
  MISSING_TABLE,
  MissingFinancialTablesError,
  getHouseholdAccounts,
  getHouseholdTransactions,
  toPhoenixDate,
} from "@/lib/household-finance-queries";
import {
  detectRecurringStreams,
  type HouseholdRecurringData,
  type RecurringOverride,
} from "@/lib/recurring-detection";

// Fifteen months so a yearly charge has a chance to show up three times only
// after a long history, but quarterly and monthly streams detect quickly.
const LOOKBACK_MONTHS = 15;

export async function getHouseholdRecurringData(): Promise<HouseholdRecurringData | null> {
  const { supabase, practiceId } = await requireMemberModuleAccess("financial");
  const today = toPhoenixDate(new Date());
  const startDate = `${shiftMonthKey(today.slice(0, 7), -(LOOKBACK_MONTHS - 1))}-01`;

  let accounts;
  try {
    ({ accounts } = await getHouseholdAccounts(supabase, practiceId));
  } catch (error) {
    if (error instanceof MissingFinancialTablesError) return null;
    throw error;
  }

  const [transactions, overridesResult] = await Promise.all([
    getHouseholdTransactions(supabase, practiceId, startDate),
    supabase.from("financial_recurring_overrides").select("stream_key, status").eq("practice_id", practiceId),
  ]);

  const overrides: Record<string, RecurringOverride> = {};
  if (overridesResult.error && overridesResult.error.code !== MISSING_TABLE) {
    throw new Error(overridesResult.error.message);
  }
  for (const row of overridesResult.data ?? []) {
    if (row.status === "confirmed" || row.status === "dismissed") {
      overrides[row.stream_key as string] = row.status;
    }
  }

  return detectRecurringStreams({ transactions, accounts, today, overrides });
}

const statusSchema = z.object({
  streamKey: z.string().trim().min(1).max(200),
  status: z.enum(["confirmed", "dismissed", "detected"]),
});

export async function setRecurringStreamStatus(input: { streamKey: string; status: "confirmed" | "dismissed" | "detected" }) {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid recurring stream update" } as const;

  const { supabase, practiceId, userId } = await requireMemberModuleAccess("financial");
  const { streamKey, status } = parsed.data;

  const query =
    status === "detected"
      ? supabase.from("financial_recurring_overrides").delete().eq("practice_id", practiceId).eq("stream_key", streamKey)
      : supabase.from("financial_recurring_overrides").upsert(
          {
            practice_id: practiceId,
            stream_key: streamKey,
            status,
            updated_by: userId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "practice_id,stream_key" },
        );

  const { error } = await query;
  if (error) {
    if (error.code === MISSING_TABLE) {
      return { error: "Recurring overrides are not set up yet. Apply the financial_recurring_overrides migration." } as const;
    }
    return { error: error.message } as const;
  }

  revalidatePath("/admin/financial");
  return { success: true } as const;
}
