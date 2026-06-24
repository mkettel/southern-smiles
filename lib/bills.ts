import {
  endOfMonth,
  endOfWeek,
  format,
  isBefore,
  isSameMonth,
  isWithinInterval,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type {
  Bill,
  BillAgingBucket,
  BillCategory,
  BillsSummary,
  BillVendor,
  BillVendorSummary,
  Stat,
} from "@/lib/types";

export const BILL_CATEGORIES = [
  "Rent",
  "Equipment Loans",
  "Marketing",
  "Lab Fees",
  "Dental Supplies",
  "Software",
  "Utilities",
  "Insurance",
  "Professional Services",
  "Miscellaneous",
] as const satisfies readonly BillCategory[];

export const BILL_AGING_BUCKETS = [
  "current",
  "30",
  "60",
  "90",
  "120_plus",
] as const satisfies readonly BillAgingBucket[];

export const BILL_AGING_LABELS: Record<BillAgingBucket, string> = {
  current: "Current",
  "30": "30 days past due",
  "60": "60 days past due",
  "90": "90 days past due",
  "120_plus": "120+ days overdue",
};

export function todayString(date = new Date()): string {
  return format(date, "yyyy-MM-dd");
}

export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function parseDollarAmountToCents(value: string): number {
  const cleaned = value.replace(/[$,]/g, "").trim();
  if (!cleaned) return 0;
  return Math.round(Number(cleaned) * 100);
}

export function formatDateLabel(date: string | null): string {
  if (!date) return "—";
  return format(new Date(date + "T00:00:00"), "MMM d, yyyy");
}

export function isBillsManagedStat(
  stat: Pick<Stat, "name" | "stat_type"> & {
    post?: { division?: { number?: number | null } | null } | null;
  },
): boolean {
  const divisionNumber = stat.post?.division?.number;
  const normalizedName = stat.name
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/\s+/g, " ");
  return (
    (normalizedName === "bill" || normalizedName === "bills") &&
    stat.stat_type === "dollar" &&
    (divisionNumber === 3 || divisionNumber === 7)
  );
}

export function getAgingBucket(
  dueDate: string,
  referenceDate = new Date(),
): BillAgingBucket {
  const due = new Date(dueDate + "T00:00:00");
  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);
  const daysPastDue = Math.floor(
    (today.getTime() - due.getTime()) / 86_400_000,
  );

  if (daysPastDue <= 0) return "current";
  if (daysPastDue <= 30) return "30";
  if (daysPastDue <= 60) return "60";
  if (daysPastDue <= 90) return "90";
  return "120_plus";
}

export function isBillOverdue(bill: Bill, referenceDate = new Date()): boolean {
  if (bill.status !== "unpaid") return false;
  const due = new Date(bill.due_date + "T00:00:00");
  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);
  return isBefore(due, today);
}

export function buildVendorSummaries(
  vendors: BillVendor[],
  bills: Bill[],
): BillVendorSummary[] {
  return vendors.map((vendor) => {
    const vendorBills = bills.filter((bill) => bill.vendor_id === vendor.id);
    const unpaid = vendorBills.filter((bill) => bill.status === "unpaid");
    return {
      ...vendor,
      bill_count: vendorBills.length,
      unpaid_count: unpaid.length,
      unpaid_total_cents: unpaid.reduce(
        (sum, bill) => sum + bill.amount_cents,
        0,
      ),
    };
  });
}

export function buildBillsSummary(
  bills: Bill[],
  referenceDate = new Date(),
): BillsSummary {
  const unpaid = bills.filter((bill) => bill.status === "unpaid");
  const paidThisMonth = bills.filter((bill) => {
    if (bill.status !== "paid" || !bill.paid_date) return false;
    return isSameMonth(new Date(bill.paid_date + "T00:00:00"), referenceDate);
  });

  const unpaidByAging = Object.fromEntries(
    BILL_AGING_BUCKETS.map((bucket) => [bucket, 0]),
  ) as Record<BillAgingBucket, number>;

  const vendorTotals = new Map<string, { vendor_name: string; total_cents: number }>();
  const categoryTotals = new Map<BillCategory, number>();

  for (const bill of unpaid) {
    const bucket = getAgingBucket(bill.due_date, referenceDate);
    unpaidByAging[bucket] += bill.amount_cents;

    const vendorId = bill.vendor_id;
    const vendorName = bill.vendor?.name ?? "Unknown vendor";
    const existingVendor = vendorTotals.get(vendorId) ?? {
      vendor_name: vendorName,
      total_cents: 0,
    };
    existingVendor.total_cents += bill.amount_cents;
    vendorTotals.set(vendorId, existingVendor);

    categoryTotals.set(
      bill.category,
      (categoryTotals.get(bill.category) ?? 0) + bill.amount_cents,
    );
  }

  const weekRange = {
    start: startOfWeek(referenceDate, { weekStartsOn: 1 }),
    end: endOfWeek(referenceDate, { weekStartsOn: 1 }),
  };
  const monthRange = {
    start: startOfMonth(referenceDate),
    end: endOfMonth(referenceDate),
  };

  return {
    total_unpaid_cents: unpaid.reduce((sum, bill) => sum + bill.amount_cents, 0),
    total_paid_this_month_cents: paidThisMonth.reduce(
      (sum, bill) => sum + bill.amount_cents,
      0,
    ),
    unpaid_by_aging: unpaidByAging,
    unpaid_by_vendor: [...vendorTotals.entries()]
      .map(([vendor_id, value]) => ({ vendor_id, ...value }))
      .sort((a, b) => b.total_cents - a.total_cents),
    unpaid_by_category: [...categoryTotals.entries()]
      .map(([category, total_cents]) => ({ category, total_cents }))
      .sort((a, b) => b.total_cents - a.total_cents),
    due_this_week: unpaid.filter((bill) =>
      isWithinInterval(new Date(bill.due_date + "T00:00:00"), weekRange),
    ),
    due_this_month: unpaid.filter((bill) =>
      isWithinInterval(new Date(bill.due_date + "T00:00:00"), monthRange),
    ),
    overdue: unpaid
      .filter((bill) => isBillOverdue(bill, referenceDate))
      .sort((a, b) => a.due_date.localeCompare(b.due_date)),
  };
}
