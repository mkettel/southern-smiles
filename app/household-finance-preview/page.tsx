import { notFound } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { HouseholdOverviewDashboard } from "@/components/financial/household-overview-dashboard";
import {
  buildHouseholdFinanceData,
  shiftMonthKey,
  type HouseholdAccountRow,
  type HouseholdSnapshotRow,
  type HouseholdTransactionRow,
} from "@/lib/household-finance";
import { detectRecurringStreams } from "@/lib/recurring-detection";

// Dev-only preview of the household overview with deterministic sample data,
// so the layout can be iterated on without a Plaid connection or a login.

const PRACTICE_ID = "00000000-0000-4000-8000-000000000002";

const accounts: HouseholdAccountRow[] = [
  { id: "acct-checking", name: "Everyday Checking", nickname: null, mask: "0235", account_type: "depository", account_subtype: "checking", current_balance_cents: 978_412, available_balance_cents: 962_180, credit_limit_cents: null, minimum_payment_cents: null, next_payment_due_date: null, last_synced_at: "2026-09-11T13:05:00Z", institution_name: "Bank of America" },
  { id: "acct-bills", name: "Bills Checking", nickname: "Bills", mask: "9040", account_type: "depository", account_subtype: "checking", current_balance_cents: 159_640, available_balance_cents: 158_400, credit_limit_cents: null, minimum_payment_cents: null, next_payment_due_date: null, last_synced_at: "2026-09-11T13:05:00Z", institution_name: "Bank of America" },
  { id: "acct-savings", name: "Online Savings", nickname: "Emergency fund", mask: "7710", account_type: "depository", account_subtype: "savings", current_balance_cents: 1_240_000, available_balance_cents: 1_240_000, credit_limit_cents: null, minimum_payment_cents: null, next_payment_due_date: null, last_synced_at: "2026-09-11T12:40:00Z", institution_name: "Ally" },
  { id: "acct-visa", name: "Customized Cash Rewards", nickname: "Cash rewards Visa", mask: "3881", account_type: "credit", account_subtype: "credit card", current_balance_cents: 321_455, available_balance_cents: null, credit_limit_cents: 1_500_000, minimum_payment_cents: 8_500, next_payment_due_date: "2026-09-28", last_synced_at: "2026-09-11T13:05:00Z", institution_name: "Bank of America" },
  { id: "acct-travel", name: "Sapphire Preferred", nickname: "Travel card", mask: "0604", account_type: "credit", account_subtype: "credit card", current_balance_cents: 0, available_balance_cents: null, credit_limit_cents: 1_000_000, minimum_payment_cents: null, next_payment_due_date: null, last_synced_at: "2026-09-11T11:50:00Z", institution_name: "Chase" },
];

// Small deterministic generator so the preview is stable between reloads.
function makeRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

const MERCHANTS: Record<string, string[]> = {
  FOOD_AND_DRINK: ["Sprouts", "Trader Joe's", "Chipotle", "Pizzeria Bianco", "Starbucks", "Fry's Food"],
  TRANSPORTATION: ["QT Fuel", "Chevron", "Waymo", "ADOT MVD"],
  GENERAL_MERCHANDISE: ["Amazon", "Target", "Costco", "REI"],
  ENTERTAINMENT: ["Harkins Theatres", "Steam", "AMC Theatres"],
  MEDICAL: ["Banner Health", "CVS Pharmacy"],
  PERSONAL_CARE: ["Great Clips", "Ulta"],
  GENERAL_SERVICES: ["Rover", "Jiffy Lube", "USPS"],
  HOME_IMPROVEMENT: ["Home Depot", "Lowe's"],
  TRAVEL: ["Southwest", "Airbnb", "Hertz"],
};

function buildFixtures(today: string) {
  const random = makeRandom(20260911);
  const transactions: HouseholdTransactionRow[] = [];
  let counter = 0;
  const push = (row: Omit<HouseholdTransactionRow, "id">) => {
    counter += 1;
    transactions.push({ id: `txn-${counter}`, ...row });
  };
  const day = (monthKey: string, dayOfMonth: number) => `${monthKey}-${String(Math.min(28, dayOfMonth)).padStart(2, "0")}`;
  const currentKey = today.slice(0, 7);
  const todayDay = Number(today.slice(8, 10));

  for (let offset = 11; offset >= 0; offset -= 1) {
    const key = shiftMonthKey(currentKey, -offset);
    const isCurrent = offset === 0;
    const withinMonth = (d: number) => !isCurrent || d <= todayDay;

    for (const payday of [1, 15]) {
      if (!withinMonth(payday)) continue;
      push({ account_id: "acct-checking", transaction_date: day(key, payday), name: "SYMMETRIA PAYROLL", merchant_name: "Symmetria", amount_cents: -410_000, pending: false, plaid_category_primary: "INCOME" });
    }
    if (withinMonth(1)) {
      push({ account_id: "acct-bills", transaction_date: day(key, 1), name: "MORTGAGE PMT", merchant_name: "Rocket Mortgage", amount_cents: 214_500, pending: false, plaid_category_primary: "LOAN_PAYMENTS" });
      push({ account_id: "acct-bills", transaction_date: day(key, 3), name: "APS ELECTRIC", merchant_name: "APS", amount_cents: 18_000 + Math.round(random() * 9_000), pending: false, plaid_category_primary: "RENT_AND_UTILITIES" });
      push({ account_id: "acct-bills", transaction_date: day(key, 5), name: "CITY OF PHOENIX WATER", merchant_name: "City of Phoenix", amount_cents: 6_200 + Math.round(random() * 2_000), pending: false, plaid_category_primary: "RENT_AND_UTILITIES" });
      push({ account_id: "acct-bills", transaction_date: day(key, 8), name: "TOYOTA FINANCIAL", merchant_name: "Toyota Financial", amount_cents: 61_200, pending: false, plaid_category_primary: "LOAN_PAYMENTS" });
    }
    if (withinMonth(2)) {
      // Move money to the bills account and to savings: transfers, not spending.
      push({ account_id: "acct-checking", transaction_date: day(key, 2), name: "ONLINE TRANSFER TO CHK 9040", merchant_name: null, amount_cents: 320_000, pending: false, plaid_category_primary: "TRANSFER_OUT" });
      push({ account_id: "acct-bills", transaction_date: day(key, 2), name: "ONLINE TRANSFER FROM CHK 0235", merchant_name: null, amount_cents: -320_000, pending: false, plaid_category_primary: "TRANSFER_IN" });
      push({ account_id: "acct-checking", transaction_date: day(key, 2), name: "TRANSFER TO ALLY SAVINGS", merchant_name: "Ally", amount_cents: 75_000, pending: false, plaid_category_primary: "TRANSFER_OUT" });
      push({ account_id: "acct-savings", transaction_date: day(key, 2), name: "TRANSFER FROM BOFA", merchant_name: null, amount_cents: -75_000, pending: false, plaid_category_primary: "TRANSFER_IN" });
    }
    // Fixed subscriptions and bills on the card, same day every month.
    const fixed: Array<[number, string, string, number, string]> = [
      [3, "Spotify", "SPOTIFY USA", 1_199, "ENTERTAINMENT"],
      [12, "Netflix", "NETFLIX.COM", 1_549, "ENTERTAINMENT"],
      [18, "Verizon", "VERIZON WIRELESS", 8_920, "GENERAL_SERVICES"],
      [22, "State Farm", "STATE FARM INSURANCE", 14_255, "GENERAL_SERVICES"],
      [9, "Planet Fitness", "PLANET FITNESS", 2_499, "PERSONAL_CARE"],
      [26, "Adobe", "ADOBE CREATIVE CLOUD", 5_999, "GENERAL_SERVICES"],
    ];
    for (const [dayOfMonth, merchant, name, amount, category] of fixed) {
      if (!withinMonth(dayOfMonth)) continue;
      push({ account_id: "acct-visa", transaction_date: day(key, dayOfMonth), name, merchant_name: merchant, amount_cents: amount, pending: false, plaid_category_primary: category });
    }
    if (offset === 10 || offset === 5) {
      push({ account_id: "acct-visa", transaction_date: day(key, 14), name: "AMAZON PRIME", merchant_name: "Amazon Prime", amount_cents: 13_900, pending: false, plaid_category_primary: "GENERAL_SERVICES" });
    }
    if (offset >= 6) {
      push({ account_id: "acct-visa", transaction_date: day(key, 6), name: "HULU", merchant_name: "Hulu", amount_cents: 1_799, pending: false, plaid_category_primary: "ENTERTAINMENT" });
    }
    if (withinMonth(20)) {
      // Credit card payment: shows on both sides, excluded from cash flow.
      const payment = 280_000 + Math.round(random() * 60_000);
      push({ account_id: "acct-checking", transaction_date: day(key, 20), name: "BANK OF AMERICA CREDIT CARD PAYMENT", merchant_name: null, amount_cents: payment, pending: false, plaid_category_primary: "TRANSFER_OUT" });
      push({ account_id: "acct-visa", transaction_date: day(key, 20), name: "PAYMENT - THANK YOU", merchant_name: null, amount_cents: -payment, pending: false, plaid_category_primary: "TRANSFER_IN" });
    }

    const plan: Array<[string, number, number, number]> = [
      ["FOOD_AND_DRINK", 14, 1_200, 9_800],
      ["TRANSPORTATION", 5, 3_200, 7_600],
      ["GENERAL_MERCHANDISE", 6, 1_800, 22_000],
      ["ENTERTAINMENT", 3, 1_099, 6_500],
      ["GENERAL_SERVICES", 2, 2_400, 9_900],
      ["PERSONAL_CARE", 1, 2_800, 6_000],
      ["MEDICAL", offset % 3 === 0 ? 2 : 0, 2_500, 18_000],
      ["HOME_IMPROVEMENT", offset % 4 === 1 ? 2 : 0, 4_000, 26_000],
      ["TRAVEL", offset === 2 || offset === 7 ? 3 : 0, 12_000, 48_000],
    ];
    for (const [category, count, min, max] of plan) {
      for (let index = 0; index < count; index += 1) {
        const dayOfMonth = 1 + Math.floor(random() * 28);
        if (!withinMonth(dayOfMonth)) continue;
        const merchants = MERCHANTS[category];
        const merchant = merchants[Math.floor(random() * merchants.length)];
        const account = category === "TRAVEL" ? "acct-travel" : random() < 0.85 ? "acct-visa" : "acct-checking";
        push({ account_id: account, transaction_date: day(key, dayOfMonth), name: merchant.toUpperCase(), merchant_name: merchant, amount_cents: min + Math.round(random() * (max - min)), pending: false, plaid_category_primary: category });
      }
    }
    if (offset === 4) {
      push({ account_id: "acct-visa", transaction_date: day(key, 12), name: "REI RETURN", merchant_name: "REI", amount_cents: -8_900, pending: false, plaid_category_primary: "GENERAL_MERCHANDISE" });
    }
  }

  // A couple of holds in the current month.
  push({ account_id: "acct-visa", transaction_date: today, name: "SHELL OIL", merchant_name: "Shell", amount_cents: 5_210, pending: true, plaid_category_primary: "TRANSPORTATION" });
  push({ account_id: "acct-visa", transaction_date: today, name: "POSTINO WINECAFE", merchant_name: "Postino", amount_cents: 6_480, pending: true, plaid_category_primary: "FOOD_AND_DRINK" });

  const snapshots: HouseholdSnapshotRow[] = [];
  const base = new Date(`${today}T12:00:00`);
  for (let back = 30; back >= 1; back -= 1) {
    const date = new Date(base);
    date.setDate(base.getDate() - back);
    const iso = date.toISOString().slice(0, 10);
    const drift = Math.sin(back / 4) * 60_000;
    snapshots.push({ account_id: "acct-checking", snapshot_date: iso, balance_cents: Math.round(940_000 + drift + back * 1_800) });
    snapshots.push({ account_id: "acct-bills", snapshot_date: iso, balance_cents: Math.round(150_000 + drift / 4) });
    snapshots.push({ account_id: "acct-savings", snapshot_date: iso, balance_cents: 1_240_000 - Math.floor(back / 30) * 75_000 });
    snapshots.push({ account_id: "acct-visa", snapshot_date: iso, balance_cents: Math.round(300_000 - drift / 2 + (30 - back) * 700) });
    snapshots.push({ account_id: "acct-travel", snapshot_date: iso, balance_cents: 0 });
  }

  return { transactions, snapshots };
}

export default function HouseholdFinancePreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Phoenix", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const { transactions, snapshots } = buildFixtures(today);
  const data = buildHouseholdFinanceData({
    accounts,
    transactions,
    snapshots,
    today,
    connectionCount: 3,
    lastSyncedAt: "2026-09-11T13:05:00Z",
  });

  const recurring = detectRecurringStreams({
    transactions,
    accounts,
    today,
    overrides: { "rocket mortgage": "confirmed", "jiffy lube": "dismissed" },
  });

  return (
    <div className="flex h-screen overflow-hidden bg-background" data-practice-id={PRACTICE_ID}>
      <Sidebar role="admin" practiceName="Kettelkamp Household" />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b px-4 sm:px-6">
          <p className="text-sm text-muted-foreground">Kettelkamp Household</p>
          <div className="flex items-center gap-3 text-sm">
            <span className="rounded-md border bg-muted/40 px-2 py-1 text-xs text-muted-foreground">Sample data</span>
            <span className="hidden text-muted-foreground sm:inline">Matt Kettelkamp</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">MK</span>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1500px]">
            <header className="mb-8 border-b pb-5">
              <h1 className="px-1 text-2xl font-semibold">Finances</h1>
            </header>
            <HouseholdOverviewDashboard data={data} recurring={recurring} previewMode />
          </div>
        </main>
      </div>
    </div>
  );
}
