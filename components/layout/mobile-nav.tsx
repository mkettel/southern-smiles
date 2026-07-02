"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import {
  Menu,
  LayoutDashboard,
  Settings,
  FileText,
  BarChart3,
  MessageSquarePlus,
  Shield,
  Building2,
  Network,
  Wrench,
  Bell,
  CheckSquare,
  Download,
  ReceiptText,
  BadgeDollarSign,
} from "lucide-react";

interface MobileNavProps {
  role: UserRole;
  openRequestCount?: number;
  newRequestCount?: number;
  practiceName?: string;
  canAccessBills?: boolean;
}

interface NavLink {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const sharedLinks: NavLink[] = [
  { href: "/dashboard", label: "OIC", icon: LayoutDashboard },
  { href: "/stats", label: "Stats", icon: BarChart3 },
  { href: "/tasks", label: "My Tasks", icon: CheckSquare },
  { href: "/oic-log", label: "Action Log", icon: FileText },
  { href: "/org-board", label: "Org Board", icon: Network },
];

const adminOnlyLinks: NavLink[] = [
  { href: "/admin/tasks", label: "Command Center", icon: CheckSquare },
  { href: "/admin/organization", label: "Organization", icon: Building2 },
  { href: "/admin/stats", label: "Manage Stats", icon: BarChart3 },
  { href: "/admin/bills", label: "Bills", icon: ReceiptText },
  { href: "/admin/cherry-financing", label: "Approved Financing", icon: BadgeDollarSign },
  { href: "/admin/export", label: "Export & Analyze", icon: Download },
  { href: "/admin/employees", label: "Manage Team", icon: Settings },
  { href: "/admin/updates", label: "Updates", icon: Bell },
  { href: "/requests", label: "Requests", icon: MessageSquarePlus },
  { href: "/admin/settings", label: "Settings", icon: Wrench },
];

const billsOfficerLinks: NavLink[] = [
  { href: "/admin/bills", label: "Bills", icon: ReceiptText },
];

export function MobileNav({ role, openRequestCount = 0, newRequestCount = 0, practiceName = "Stats & Conditions", canAccessBills = false }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const isAdmin = role === "admin";
  const accessLinks = isAdmin ? adminOnlyLinks : canAccessBills ? billsOfficerLinks : [];

  function renderLink(link: NavLink, badge?: number) {
    const Icon = link.icon;
    const active = pathname === link.href || pathname.startsWith(link.href + "/");
    return (
      <Link
        key={link.href}
        href={link.href}
        onClick={() => setOpen(false)}
        className={cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          active
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <Icon className="h-4 w-4" />
        <span className="flex-1">{link.label}</span>
        {badge !== undefined && badge > 0 && (
          <span className={cn(
            "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold",
            badge !== undefined && badge > 0 && newRequestCount > 0
              ? "bg-blue-500 text-white"
              : "bg-muted text-muted-foreground"
          )}>
            {badge}
          </span>
        )}
      </Link>
    );
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className="inline-flex items-center justify-center rounded-md p-2 hover:bg-muted transition-colors md:hidden">
        <Menu className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <SheetTitle className="flex h-14 items-center border-b px-4 font-semibold text-lg">
          {practiceName}
        </SheetTitle>
        <nav className="p-3 space-y-1">
          {sharedLinks.map((link) => renderLink(link))}

          {accessLinks.length > 0 && (
            <>
              <div className="pt-4 pb-1 px-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  <Shield className="h-3 w-3" />
                  Admin
                </div>
              </div>
              {accessLinks.map((link) =>
                renderLink(
                  link,
                  link.href === "/requests" ? openRequestCount : undefined
                )
              )}
            </>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
