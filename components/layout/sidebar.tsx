"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types";
import {
  LayoutDashboard,
  ClipboardEdit,
  Users,
  Settings,
  FileText,
  BarChart3,
  MessageSquarePlus,
} from "lucide-react";

interface SidebarProps {
  role: UserRole;
  openRequestCount?: number;
}

const employeeLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/enter", label: "Enter Stats", icon: ClipboardEdit },
];

const adminLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/enter", label: "Enter Stats", icon: ClipboardEdit },
  { href: "/team", label: "Team", icon: Users },
  { href: "/oic-log", label: "OIC Log", icon: FileText },
  { href: "/admin/stats", label: "Manage Stats", icon: BarChart3 },
  { href: "/admin/employees", label: "Manage Team", icon: Settings },
  { href: "/requests", label: "Requests", icon: MessageSquarePlus, adminOnly: true },
];

export function Sidebar({ role, openRequestCount = 0 }: SidebarProps) {
  const pathname = usePathname();
  const links = role === "admin" ? adminLinks : employeeLinks;

  return (
    <aside className="hidden md:flex md:w-56 md:flex-col md:border-r bg-muted/30">
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/dashboard" className="font-semibold text-lg">
          Southern Smiles
        </Link>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {links.map((link) => {
          const Icon = link.icon;
          const active = pathname === link.href || pathname.startsWith(link.href + "/");
          const showBadge = link.href === "/requests" && openRequestCount > 0;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1">{link.label}</span>
              {showBadge && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                  {openRequestCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
