import type { LucideIcon } from "lucide-react";
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
  Mailbox,
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
}

export const sharedLinks: NavLink[] = [
  { href: "/dashboard", label: "OIC", icon: LayoutDashboard },
  { href: "/stats", label: "Stats", icon: BarChart3 },
  { href: "/tasks", label: "My Tasks", icon: CheckSquare },
  { href: "/oic-log", label: "Action Log", icon: FileText },
  { href: "/org-board", label: "Org Board", icon: Network },
];

export const adminOnlyLinks: NavLink[] = [
  { href: "/admin/tasks", label: "Command Center", icon: CheckSquare },
  { href: "/admin/overhead", label: "Overhead", icon: Calculator },
  { href: "/admin/procedures", label: "Procedure Costs", icon: ClipboardList },
  { href: "/admin/supplies", label: "Supply Ordering", icon: ShoppingCart },
  { href: "/admin/supply-invoices", label: "Supply Invoice Inbox", icon: PackageSearch },
  { href: "/admin/bills", label: "Bills", icon: ReceiptText },
  { href: "/admin/financial", label: "Financial", icon: Landmark },
  { href: "/admin/cherry-financing", label: "Approved Financing", icon: BadgeDollarSign },
  { href: "/admin/surveys", label: "Patient Surveys", icon: Mailbox },
  { href: "/admin/export", label: "Export & Analyze", icon: Download },
  { href: "/admin/stats", label: "Stats Setup", icon: BarChart3 },
  { href: "/admin/employees", label: "Team & Access", icon: Settings },
  { href: "/requests", label: "Requests", icon: MessageSquarePlus },
  { href: "/admin/settings", label: "Settings", icon: Wrench },
];

export const billsOfficerLinks: NavLink[] = [
  { href: "/admin/bills", label: "Bills", icon: ReceiptText },
];

export const supplyOfficerLinks: NavLink[] = [
  { href: "/admin/supplies", label: "Supply Ordering", icon: ShoppingCart },
];
