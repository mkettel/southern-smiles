import type { LucideIcon } from "lucide-react";
import {
  getWorkspaceLabel,
  type ModuleKey,
  type WorkspaceAccess,
} from "@/lib/workspace-access";
import {
  BadgeDollarSign,
  BarChart3,
  Calculator,
  CheckSquare,
  ClipboardList,
  Download,
  FileText,
  Landmark,
  LayoutDashboard,
  MessageSquarePlus,
  Network,
  PackageSearch,
  ReceiptText,
  Settings,
  ShoppingCart,
  Wrench,
} from "lucide-react";

export interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
  moduleKey?: ModuleKey;
}

export const sharedLinks: NavLink[] = [
  { href: "/dashboard", label: "OIC", icon: LayoutDashboard, moduleKey: "operations" },
  { href: "/stats", label: "Stats", icon: BarChart3, moduleKey: "stats" },
  { href: "/tasks", label: "My Tasks", icon: CheckSquare, moduleKey: "tasks" },
  { href: "/oic-log", label: "Action Log", icon: FileText, moduleKey: "oic_log" },
  { href: "/org-board", label: "Org Board", icon: Network, moduleKey: "org_board" },
];

export const adminOnlyLinks: NavLink[] = [
  { href: "/admin/tasks", label: "Command Center", icon: CheckSquare, moduleKey: "command_center" },
  { href: "/admin/overhead", label: "Overhead", icon: Calculator, moduleKey: "budgeting" },
  { href: "/admin/procedures", label: "Procedure Costs", icon: ClipboardList, moduleKey: "procedure_costs" },
  { href: "/admin/supplies", label: "Supply Ordering", icon: ShoppingCart, moduleKey: "supply_management" },
  { href: "/admin/supply-invoices", label: "Supply Invoice Inbox", icon: PackageSearch, moduleKey: "supply_management" },
  { href: "/admin/bills", label: "Bills", icon: ReceiptText, moduleKey: "bills" },
  { href: "/admin/financial", label: "Financial", icon: Landmark, moduleKey: "financial" },
  { href: "/admin/cherry-financing", label: "Approved Financing", icon: BadgeDollarSign, moduleKey: "approved_financing" },
  { href: "/admin/export", label: "Export & Analyze", icon: Download, moduleKey: "export_analyze" },
  { href: "/admin/stats", label: "Stats Setup", icon: BarChart3, moduleKey: "stats" },
  { href: "/admin/employees", label: "Team & Access", icon: Settings, moduleKey: "team_access" },
  { href: "/requests", label: "Requests", icon: MessageSquarePlus },
  { href: "/admin/settings", label: "Settings", icon: Wrench },
];

export const billsOfficerLinks: NavLink[] = [
  { href: "/admin/bills", label: "Bills", icon: ReceiptText, moduleKey: "bills" },
];

export const supplyOfficerLinks: NavLink[] = [
  { href: "/admin/supplies", label: "Supply Ordering", icon: ShoppingCart, moduleKey: "supply_management" },
];

export const financialAccessLinks: NavLink[] = [
  { href: "/admin/financial", label: "Financial", icon: Landmark, moduleKey: "financial" },
];

export function resolveNavigationLinks(
  links: NavLink[],
  access: WorkspaceAccess,
): NavLink[] {
  return links
    .filter((link) => !link.moduleKey || access.modules[link.moduleKey])
    .map((link) => ({
      ...link,
      label: link.moduleKey
        ? getWorkspaceLabel(access, link.moduleKey, link.label)
        : link.label,
    }));
}
