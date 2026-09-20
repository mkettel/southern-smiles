import Link from "next/link";
import { Plus } from "lucide-react";
import { getWorkspaceAccess } from "@/actions/workspace-access";
import { cn } from "@/lib/utils";

const tabs = [
  { id: "overview", href: "/admin/financial" },
  { id: "spending", href: "/admin/financial/spending" },
  { id: "bookkeeping", href: "/admin/financial-transactions" },
  { id: "rules", href: "/admin/financial/rules" },
  { id: "accounts", href: "/admin/financial/accounts" },
  { id: "loans", href: "/admin/financial/loans" },
  { id: "reports", href: "/admin/financial/reports" },
  { id: "connections", href: "/admin/financial-connections" },
] as const;

export type FinancialWorkspaceTab = typeof tabs[number]["id"];

// A null label hides the tab for that workspace. Practices keep the full
// QuickBooks-style bookkeeping set; households get personal-finance tabs.
const TAB_LABELS: Record<"practice" | "household", Record<FinancialWorkspaceTab, string | null>> = {
  practice: {
    overview: "Overview",
    spending: null,
    bookkeeping: "Bookkeeping",
    rules: "Rules",
    accounts: "Chart of accounts",
    loans: "Loans",
    reports: "Reports",
    connections: "Connections",
  },
  household: {
    overview: "Overview",
    spending: "Spending",
    bookkeeping: "Transactions",
    rules: null,
    accounts: null,
    loans: "Loans",
    reports: null,
    connections: "Connections",
  },
};

export async function FinancialWorkspaceShell({
  active,
  children,
}: {
  active: FinancialWorkspaceTab;
  children: React.ReactNode;
}) {
  const access = await getWorkspaceAccess();
  const isHousehold = access.workspaceType === "household";
  const labels = TAB_LABELS[isHousehold ? "household" : "practice"];
  const visibleTabs = tabs.flatMap((tab) => {
    const label = labels[tab.id];
    return label ? [{ ...tab, label }] : [];
  });

  return (
    <div className="mx-auto w-full max-w-[1500px] [font-family:var(--font-geist-sans)]">
      <header className="mb-8 border-b">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="px-1 text-2xl font-semibold">{isHousehold ? "Finances" : "Financial"}</h1>
          {isHousehold && <Link href="/admin/financial/cash" className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"><Plus className="h-4 w-4" aria-hidden />Add expense</Link>}
        </div>
        <nav className="mt-5 flex gap-7 overflow-x-auto px-1" aria-label="Financial workspace">
          {visibleTabs.map((tab) => (
            <Link
              key={tab.id}
              href={tab.href}
              className={cn(
                "relative shrink-0 pb-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                active === tab.id && "text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-emerald-600",
              )}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}
