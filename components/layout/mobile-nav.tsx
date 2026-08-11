"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types";
import { resolveWorkspaceAccess, type WorkspaceAccess } from "@/lib/workspace-access";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import {
  Menu,
  Shield,
} from "lucide-react";
import {
  adminOnlyLinks,
  billsOfficerLinks,
  sharedLinks,
  supplyOfficerLinks,
  resolveNavigationLinks,
  type NavLink,
} from "./navigation-links";

interface MobileNavProps {
  role: UserRole;
  openRequestCount?: number;
  newRequestCount?: number;
  practiceName?: string;
  canAccessBills?: boolean;
  canAccessSupplies?: boolean;
  workspaceAccess?: WorkspaceAccess;
}

export function MobileNav({ role, openRequestCount = 0, newRequestCount = 0, practiceName = "Stats & Conditions", canAccessBills = false, canAccessSupplies = false, workspaceAccess = resolveWorkspaceAccess() }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const isAdmin = role === "admin";
  const visibleSharedLinks = resolveNavigationLinks(sharedLinks, workspaceAccess);
  const accessLinks = resolveNavigationLinks(isAdmin
    ? adminOnlyLinks
    : [
        ...(canAccessBills ? billsOfficerLinks : []),
        ...(canAccessSupplies ? supplyOfficerLinks : []),
      ], workspaceAccess);

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
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
          {visibleSharedLinks.map((link) => renderLink(link))}

          {accessLinks.length > 0 && (
            <>
              <div className="pt-4 pb-1 px-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  <Shield className="h-3 w-3" />
                  {isAdmin ? "Admin" : "Assigned access"}
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
