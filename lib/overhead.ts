import type {
  OverheadCategory,
  OverheadCategorySummary,
  OverheadItem,
  OverheadSettings,
  OverheadSummary,
} from "@/lib/types";

export const DEFAULT_OVERHEAD_SETTINGS: OverheadSettings = {
  practice_id: "",
  operatories_count: 4,
  days_per_week: 5,
  clinical_hours_per_day: 8,
  weeks_per_month: 4.33,
  utilization_percent: 85,
  notes: null,
  created_at: "",
  updated_at: "",
};

export const DEFAULT_OVERHEAD_CATEGORIES: Array<{
  name: string;
  description: string;
}> = [
  {
    name: "Property Rent & Mortgage",
    description: "Rent, mortgage, dues, taxes, and property-related occupancy costs.",
  },
  {
    name: "Leases & Equipment",
    description: "Scanner leases, equipment notes, and other long-term equipment obligations.",
  },
  {
    name: "Loans & Lines of Credit",
    description: "Practice debt service, credit lines, and related financing costs.",
  },
  {
    name: "Banking & Merchant Fees",
    description: "Credit card fees, bank charges, and payment processing costs.",
  },
  {
    name: "Insurance",
    description: "Malpractice, work comp, liability, cyber, and business coverage.",
  },
  {
    name: "Outside Services",
    description: "Accountant, consultants, legal, payroll, and other outside vendors.",
  },
  {
    name: "Payroll & Benefits",
    description: "Team wages, payroll taxes, benefits, and people-related overhead.",
  },
  {
    name: "Marketing",
    description: "Advertising, SEO, branding, mailers, and growth-related spend.",
  },
  {
    name: "Software & Technology",
    description: "Practice software, subscriptions, phone systems, and tech tools.",
  },
  {
    name: "Supplies & Clinical Support",
    description: "General clinical overhead outside per-procedure materials and labs.",
  },
  {
    name: "Utilities & Facility",
    description: "Power, water, internet, janitorial, repairs, and building upkeep.",
  },
  {
    name: "Miscellaneous",
    description: "Anything real but uncategorized while the model is being cleaned up.",
  },
];

export function formatCurrencyFromCents(cents: number | null): string {
  if (cents === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatHours(hours: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    minimumFractionDigits: hours % 1 === 0 ? 0 : 1,
  }).format(hours);
}

export function buildOverheadCategorySummaries(
  categories: OverheadCategory[],
  items: OverheadItem[],
): OverheadCategorySummary[] {
  return categories.map((category) => {
    const activeItems = items.filter(
      (item) => item.category_id === category.id && item.is_active,
    );

    return {
      ...category,
      item_count: activeItems.length,
      total_monthly_cents: activeItems.reduce(
        (sum, item) => sum + item.monthly_cost_cents,
        0,
      ),
    };
  });
}

export function buildOverheadSummary(
  settings: OverheadSettings,
  items: OverheadItem[],
  activeCategoryIds?: Set<string>,
): OverheadSummary {
  const activeItems = items.filter(
    (item) => item.is_active && (!activeCategoryIds || activeCategoryIds.has(item.category_id)),
  );
  const totalMonthlyCents = activeItems.reduce(
    (sum, item) => sum + item.monthly_cost_cents,
    0,
  );
  const fixedMonthlyCents = activeItems
    .filter((item) => item.cost_type !== "variable")
    .reduce((sum, item) => sum + item.monthly_cost_cents, 0);
  const variableMonthlyCents = activeItems
    .filter((item) => item.cost_type === "variable")
    .reduce((sum, item) => sum + item.monthly_cost_cents, 0);

  const fullCapacityMonthlyOperatoryHours =
    settings.operatories_count *
    settings.days_per_week *
    settings.clinical_hours_per_day *
    settings.weeks_per_month;

  const configuredMonthlyOperatoryHours =
    fullCapacityMonthlyOperatoryHours * (settings.utilization_percent / 100);

  return {
    total_monthly_cents: totalMonthlyCents,
    total_weekly_cents: Math.round((totalMonthlyCents * 12) / 52),
    fixed_monthly_cents: fixedMonthlyCents,
    variable_monthly_cents: variableMonthlyCents,
    total_annual_cents: totalMonthlyCents * 12,
    full_capacity_monthly_operatory_hours: fullCapacityMonthlyOperatoryHours,
    configured_monthly_operatory_hours: configuredMonthlyOperatoryHours,
    full_capacity_cost_per_operatory_hour_cents:
      fullCapacityMonthlyOperatoryHours > 0
        ? Math.round(totalMonthlyCents / fullCapacityMonthlyOperatoryHours)
        : null,
    cost_per_operatory_hour_cents:
      configuredMonthlyOperatoryHours > 0
        ? Math.round(totalMonthlyCents / configuredMonthlyOperatoryHours)
        : null,
  };
}
