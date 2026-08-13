"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMemberModuleAccess } from "@/actions/member-module-access";
import type { FinancialLoan, FinancialLoansData } from "@/lib/financial-loans";

const loanSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  bookkeepingAccountId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  lenderName: z.string().trim().min(1).max(200),
  loanType: z.enum(["term_loan", "line_of_credit", "equipment", "vehicle", "related_party", "merchant_advance", "other"]),
  accountReference: z.string().trim().max(100).nullable().optional(),
  originalPrincipalCents: z.number().int().nonnegative().nullable().optional(),
  creditLimitCents: z.number().int().positive().nullable().optional(),
  availableCreditCents: z.number().int().nonnegative().nullable().optional(),
  currentBalanceCents: z.number().int().nonnegative(),
  scheduledPaymentCents: z.number().int().positive().nullable().optional(),
  paymentFrequency: z.enum(["weekly", "biweekly", "semimonthly", "monthly", "irregular"]).nullable().optional(),
  annualInterestRate: z.number().min(0).max(100).nullable().optional(),
  interestMethod: z.enum(["amortizing", "fixed_fee", "interest_free", "revolving", "unknown"]),
  originatedOn: z.string().date().nullable().optional(),
  maturityDate: z.string().date().nullable().optional(),
  nextPaymentDate: z.string().date().nullable().optional(),
  status: z.enum(["active", "paid_off", "archived"]),
  termsStatus: z.enum(["verified", "partial", "needs_terms"]),
  isPersonal: z.boolean(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export async function getFinancialLoansData(): Promise<FinancialLoansData> {
  const { supabase, practiceId } = await requireMemberModuleAccess("financial");
  const [loanResult, paymentResult, accountResult] = await Promise.all([
    supabase.from("financial_loans").select("*").eq("practice_id", practiceId)
      .neq("status", "archived").order("status").order("lender_name").order("name"),
    supabase.from("financial_loan_payments").select("id, loan_id, payment_date, total_cents, principal_cents, interest_cents, fee_cents, balance_after_cents, activity_kind, source")
      .eq("practice_id", practiceId).order("payment_date", { ascending: false }).limit(250),
    supabase.from("bookkeeping_accounts").select("id, account_number, name, account_type")
      .eq("practice_id", practiceId).eq("is_active", true).order("name"),
  ]);
  if (loanResult.error) throw new Error(loanResult.error.message);
  if (paymentResult.error) throw new Error(paymentResult.error.message);
  if (accountResult.error) throw new Error(accountResult.error.message);

  const paymentsByLoan = new Map<string, FinancialLoan["payments"]>();
  for (const row of paymentResult.data ?? []) {
    const payments = paymentsByLoan.get(row.loan_id as string) ?? [];
    payments.push({
      id: row.id as string,
      paymentDate: row.payment_date as string,
      totalCents: Number(row.total_cents),
      principalCents: Number(row.principal_cents),
      interestCents: Number(row.interest_cents),
      feeCents: Number(row.fee_cents),
      balanceAfterCents: row.balance_after_cents === null ? null : Number(row.balance_after_cents),
      activityKind: row.activity_kind as "payment" | "draw" | "adjustment",
      source: row.source as "bookkeeping" | "quickbooks_browser" | "manual",
    });
    paymentsByLoan.set(row.loan_id as string, payments);
  }

  return {
    loans: (loanResult.data ?? []).map((row) => ({
      id: row.id as string,
      bookkeepingAccountId: row.bookkeeping_account_id as string,
      name: row.name as string,
      lenderName: row.lender_name as string,
      loanType: row.loan_type as string,
      accountReference: row.account_reference as string | null,
      originalPrincipalCents: row.original_principal_cents === null ? null : Number(row.original_principal_cents),
      creditLimitCents: row.credit_limit_cents === null ? null : Number(row.credit_limit_cents),
      availableCreditCents: row.available_credit_cents === null ? null : Number(row.available_credit_cents),
      currentBalanceCents: Number(row.current_balance_cents),
      balanceAsOfDate: row.balance_as_of_date as string,
      scheduledPaymentCents: row.scheduled_payment_cents === null ? null : Number(row.scheduled_payment_cents),
      paymentFrequency: row.payment_frequency as string | null,
      annualInterestRate: row.annual_interest_rate === null ? null : Number(row.annual_interest_rate),
      interestMethod: row.interest_method as string,
      originatedOn: row.originated_on as string | null,
      maturityDate: row.maturity_date as string | null,
      nextPaymentDate: row.next_payment_date as string | null,
      status: row.status as FinancialLoan["status"],
      termsStatus: row.terms_status as FinancialLoan["termsStatus"],
      isPersonal: Boolean(row.is_personal),
      source: row.source as FinancialLoan["source"],
      notes: row.notes as string | null,
      payments: paymentsByLoan.get(row.id as string) ?? [],
    })),
    liabilityAccounts: (accountResult.data ?? [])
      .filter((row) => /(liabil|credit card)/i.test(row.account_type as string))
      .map((row) => ({
        id: row.id as string,
        label: [row.account_number, row.name].filter(Boolean).join(" "),
      })),
  };
}

export async function saveFinancialLoan(input: unknown) {
  const parsed = loanSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid loan" };
  const { supabase, practiceId, userId } = await requireMemberModuleAccess("financial");
  const { data: account } = await supabase.from("bookkeeping_accounts").select("id")
    .eq("practice_id", practiceId).eq("id", parsed.data.bookkeepingAccountId).eq("is_active", true).maybeSingle();
  if (!account) return { error: "Choose a liability account from the chart of accounts" };
  const values = {
    practice_id: practiceId,
    bookkeeping_account_id: parsed.data.bookkeepingAccountId,
    name: parsed.data.name,
    lender_name: parsed.data.lenderName,
    loan_type: parsed.data.loanType,
    account_reference: parsed.data.accountReference || null,
    original_principal_cents: parsed.data.loanType === "line_of_credit" ? null : parsed.data.originalPrincipalCents ?? null,
    credit_limit_cents: parsed.data.loanType === "line_of_credit" ? parsed.data.creditLimitCents ?? null : null,
    available_credit_cents: parsed.data.loanType === "line_of_credit" ? parsed.data.availableCreditCents ?? null : null,
    current_balance_cents: parsed.data.currentBalanceCents,
    balance_as_of_date: new Date().toISOString().slice(0, 10),
    scheduled_payment_cents: parsed.data.scheduledPaymentCents ?? null,
    payment_frequency: parsed.data.paymentFrequency ?? null,
    annual_interest_rate: parsed.data.annualInterestRate ?? null,
    interest_method: parsed.data.interestMethod,
    originated_on: parsed.data.originatedOn ?? null,
    maturity_date: parsed.data.maturityDate ?? null,
    next_payment_date: parsed.data.nextPaymentDate ?? null,
    status: parsed.data.status,
    terms_status: parsed.data.termsStatus,
    is_personal: parsed.data.isPersonal,
    source: "manual",
    notes: parsed.data.notes || null,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };
  const result = parsed.data.id
    ? await supabase.from("financial_loans").update(values).eq("id", parsed.data.id).eq("practice_id", practiceId)
    : await supabase.from("financial_loans").insert({ ...values, created_by: userId });
  if (result.error) return { error: result.error.message };
  revalidatePath("/admin/financial/loans");
  revalidatePath("/admin/financial-transactions");
  return { success: true };
}
