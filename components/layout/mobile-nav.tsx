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
  ClipboardEdit,
  Users,
  Settings,
  FileText,
  BarChart3,
  MessageSquarePlus,
  Shield,
  Building2,
  Network,
} from "lucide-react";

interface MobileNavProps {
  role: UserRole;
  openRequestCount?: number;
  newRequestCount?: number;
}

interface NavLink {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const sharedLinks: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/enter", label: "Enter Stats", icon: ClipboardEdit },
  { href: "/oic-log", label: "OIC Log", icon: FileText },
  { href: "/org-board", label: "Org Board", icon: Network },
];

const adminOnlyLinks: NavLink[] = [
  { href: "/team", label: "Team", icon: Users },
  { href: "/admin/organization", label: "Organization", icon: Building2 },
  { href: "/admin/stats", label: "Manage Stats", icon: BarChart3 },
  { href: "/admin/employees", label: "Manage Team", icon: Settings },
  { href: "/requests", label: "Requests", icon: MessageSquarePlus },
];

export function MobileNav({ role, openRequestCount = 0, newRequestCount = 0 }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const isAdmin = role === "admin";

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
            newRequestCount > 0
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
          Southern Smiles
        </SheetTitle>
        <nav className="p-3 space-y-1">
          {sharedLinks.map((link) => renderLink(link))}

          {isAdmin && (
            <>
              <div className="pt-4 pb-1 px-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  <Shield className="h-3 w-3" />
                  Admin
                </div>
              </div>
              {adminOnlyLinks.map((link) =>
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
