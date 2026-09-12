import Link from "next/link";
import { getWorkspaceAccess } from "@/actions/workspace-access";
import { cn } from "@/lib/utils";

const tabs = [
  { id: "overview", label: "Overview", href: "/admin/financial" },
  { id: "bookkeeping", label: "Bookkeeping", href: "/admin/financial-transactions" },
  { id: "rules", label: "Rules", href: "/admin/financial/rules" },
  { id: "accounts", label: "Chart of accounts", href: "/admin/financial/accounts" },
  { id: "loans", label: "Loans", href: "/admin/financial/loans" },
  { id: "reports", label: "Reports", href: "/admin/financial/reports" },
  { id: "connections", label: "Connections", href: "/admin/financial-connections" },
] as const;

export type FinancialWorkspaceTab = typeof tabs[number]["id"];

// Households get a trimmed tab set: the bookkeeping review flow still exists
// (as "Transactions"), but the QuickBooks-style rules, chart of accounts, and
// P&L reports are practice tooling.
const householdTabs: Record<FinancialWorkspaceTab, string | null> = {
  overview: "Overview",
  bookkeeping: "Transactions",
  rules: null,
  accounts: null,
  loans: "Loans",
  reports: null,
  connections: "Connections",
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
  const visibleTabs = tabs
    .map((tab) => ({ ...tab, label: isHousehold ? householdTabs[tab.id] : tab.label }))
    .filter((tab): tab is typeof tab & { label: string } => tab.label !== null);

  return (
    <div className="mx-auto w-full max-w-[1500px] [font-family:var(--font-geist-sans)]">
      <header className="mb-8 border-b">
        <h1 className="px-1 text-2xl font-semibold">{isHousehold ? "Finances" : "Financial"}</h1>
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
