import {
  LayoutDashboard,
  ClipboardEdit,
  CheckSquare,
  FileText,
  Network,
  Building2,
  BarChart3,
  Settings,
  Bell,
  MessageSquarePlus,
  Wrench,
  ReceiptText,
  ShoppingCart,
  BadgeDollarSign,
  Calculator,
  ClipboardList,
  User,
  Plus,
  PenSquare,
  SunMoon,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import type { UserRole } from "@/lib/types";

export type CommandActionId =
  | "create-task"
  | "new-oic-entry"
  | "toggle-theme"
  | "sign-out";

interface CommandBase {
  id: string;
  label: string;
  /** Extra search terms — never displayed. */
  keywords?: string[];
  /** Group label shown above the item in the list. */
  group: "Navigate" | "Actions";
  icon: LucideIcon;
  /** Hint text on the right (e.g. "Admin"). */
  hint?: string;
}

export type CommandItem = CommandBase &
  (
    | { type: "navigate"; href: string }
    | { type: "action"; action: CommandActionId }
  );

interface BuildOpts {
  role: UserRole;
  canAccessBills?: boolean;
  canAccessSupplies?: boolean;
}

/**
 * Build the full command list for the current user. Admin-only commands are
 * filtered out for non-admins so they never show up in search results.
 */
export function buildCommands({ role, canAccessBills = false, canAccessSupplies = false }: BuildOpts): CommandItem[] {
  const isAdmin = role === "admin";

  const navShared: CommandItem[] = [
    {
      id: "nav-dashboard",
      label: "Dashboard",
      keywords: ["home", "overview", "stats"],
      group: "Navigate",
      icon: LayoutDashboard,
      type: "navigate",
      href: "/dashboard",
    },
    {
      id: "nav-enter",
      label: "Enter Stats",
      keywords: ["log", "weekly", "daily", "submit"],
      group: "Navigate",
      icon: ClipboardEdit,
      type: "navigate",
      href: "/stats?mode=daily",
    },
    {
      id: "nav-tasks",
      label: "My Tasks",
      keywords: ["todo", "assigned"],
      group: "Navigate",
      icon: CheckSquare,
      type: "navigate",
      href: "/tasks",
    },
    {
      id: "nav-oic",
      label: "OIC Log",
      keywords: ["operational", "changes", "events"],
      group: "Navigate",
      icon: FileText,
      type: "navigate",
      href: "/oic-log",
    },
    {
      id: "nav-org",
      label: "Org Board",
      keywords: ["organization", "people", "team"],
      group: "Navigate",
      icon: Network,
      type: "navigate",
      href: "/org-board",
    },
    {
      id: "nav-profile",
      label: "My Profile",
      keywords: ["account", "me"],
      group: "Navigate",
      icon: User,
      type: "navigate",
      href: "/profile",
    },
  ];

  const navAdmin: CommandItem[] = [
    {
      id: "nav-admin-overhead",
      label: "Overhead",
      keywords: ["admin", "costs", "expenses", "operatory hour"],
      group: "Navigate",
      icon: Calculator,
      hint: "Admin",
      type: "navigate",
      href: "/admin/overhead",
    },
    {
      id: "nav-admin-procedures",
      label: "Procedure Costs",
      keywords: ["admin", "procedures", "labs", "supplies", "chair time", "true cost"],
      group: "Navigate",
      icon: ClipboardList,
      hint: "Admin",
      type: "navigate",
      href: "/admin/procedures",
    },
    {
      id: "nav-admin-supplies",
      label: "Supply Ordering",
      keywords: ["admin", "supplies", "ordering", "catalog", "purchases"],
      group: "Navigate",
      icon: ShoppingCart,
      hint: isAdmin ? "Admin" : "Supplies",
      type: "navigate",
      href: "/admin/supplies",
    },
    {
      id: "nav-admin-bills",
      label: "Bills",
      keywords: ["admin", "vendors", "invoices", "payments"],
      group: "Navigate",
      icon: ReceiptText,
      hint: isAdmin ? "Admin" : "Bills",
      type: "navigate",
      href: "/admin/bills",
    },
    {
      id: "nav-admin-cherry-financing",
      label: "Approved Financing",
      keywords: ["admin", "cherry", "financing", "approval", "approved financing"],
      group: "Navigate",
      icon: BadgeDollarSign,
      hint: "Admin",
      type: "navigate",
      href: "/admin/cherry-financing",
    },
    {
      id: "nav-admin-tasks",
      label: "Command Center",
      keywords: ["admin", "all tasks", "manage tasks"],
      group: "Navigate",
      icon: CheckSquare,
      hint: "Admin",
      type: "navigate",
      href: "/admin/tasks",
    },
    {
      id: "nav-admin-org",
      label: "Manage Organization",
      keywords: ["admin", "divisions", "posts"],
      group: "Navigate",
      icon: Building2,
      hint: "Admin",
      type: "navigate",
      href: "/admin/organization",
    },
    {
      id: "nav-admin-stats",
      label: "Manage Stats",
      keywords: ["admin", "metrics"],
      group: "Navigate",
      icon: BarChart3,
      hint: "Admin",
      type: "navigate",
      href: "/admin/stats",
    },
    {
      id: "nav-admin-employees",
      label: "Manage Team",
      keywords: ["admin", "employees", "users", "people"],
      group: "Navigate",
      icon: Settings,
      hint: "Admin",
      type: "navigate",
      href: "/admin/employees",
    },
    {
      id: "nav-admin-updates",
      label: "Updates",
      keywords: ["admin", "changelog", "announcements"],
      group: "Navigate",
      icon: Bell,
      hint: "Admin",
      type: "navigate",
      href: "/admin/updates",
    },
    {
      id: "nav-requests",
      label: "Requests",
      keywords: ["admin", "feedback", "inbox"],
      group: "Navigate",
      icon: MessageSquarePlus,
      hint: "Admin",
      type: "navigate",
      href: "/requests",
    },
    {
      id: "nav-admin-settings",
      label: "Settings",
      keywords: ["admin", "practice", "configuration"],
      group: "Navigate",
      icon: Wrench,
      hint: "Admin",
      type: "navigate",
      href: "/admin/settings",
    },
  ];

  const actions: CommandItem[] = [
    ...(isAdmin
      ? [
          {
            id: "act-create-task",
            label: "Create task",
            keywords: ["new task", "assign", "todo", "add"],
            group: "Actions" as const,
            icon: Plus,
            hint: "Admin",
            type: "action" as const,
            action: "create-task" as const,
          },
        ]
      : []),
    {
      id: "act-new-oic",
      label: "New OIC log entry",
      keywords: ["log change", "operational", "add"],
      group: "Actions",
      icon: PenSquare,
      type: "action",
      action: "new-oic-entry",
    },
    {
      id: "act-toggle-theme",
      label: "Toggle theme",
      keywords: ["dark", "light", "mode"],
      group: "Actions",
      icon: SunMoon,
      type: "action",
      action: "toggle-theme",
    },
    {
      id: "act-sign-out",
      label: "Sign out",
      keywords: ["logout", "log out", "exit"],
      group: "Actions",
      icon: LogOut,
      type: "action",
      action: "sign-out",
    },
  ];

  return [
    ...navShared,
    ...(isAdmin
      ? navAdmin
      : navAdmin.filter(
          (item) =>
            (canAccessBills && item.id === "nav-admin-bills") ||
            (canAccessSupplies && item.id === "nav-admin-supplies"),
        )),
    ...actions,
  ];
}

/** Filter commands by the user's query — case-insensitive substring match. */
export function filterCommands(items: CommandItem[], query: string): CommandItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => {
    if (item.label.toLowerCase().includes(q)) return true;
    if (item.keywords?.some((k) => k.toLowerCase().includes(q))) return true;
    if (item.group.toLowerCase().includes(q)) return true;
    return false;
  });
}
