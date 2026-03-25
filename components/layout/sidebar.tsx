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
  Shield,
  Building2,
  Network,
  Wrench,
} from "lucide-react";

interface SidebarProps {
  role: UserRole;
  openRequestCount?: number;
  newRequestCount?: number;
  practiceName?: string;
  logoUrl?: string | null;
  showNameWithLogo?: boolean;
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
  { href: "/admin/settings", label: "Settings", icon: Wrench },
];

function NavItem({
  link,
  active,
  badge,
  hasNew,
}: {
  link: NavLink;
  active: boolean;
  badge?: number;
  hasNew?: boolean;
}) {
  const Icon = link.icon;
  return (
    <Link
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
      {badge !== undefined && badge > 0 && (
        <span className={cn(
          "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold",
          hasNew
            ? "bg-blue-500 text-white"
            : "bg-muted text-muted-foreground"
        )}>
          {badge}
        </span>
      )}
    </Link>
  );
}

export function Sidebar({ role, openRequestCount = 0, newRequestCount = 0, practiceName = "Stats & Conditions", logoUrl, showNameWithLogo = true }: SidebarProps) {
  const pathname = usePathname();
  const isAdmin = role === "admin";

  return (
    <aside className="hidden md:flex md:w-56 md:flex-col md:border-r bg-muted/30">
      <Link href="/dashboard" className="flex h-14 items-center border-b px-4 gap-2.5">
        {logoUrl ? (
          showNameWithLogo ? (
            <>
              <img src={logoUrl} alt="" className="h-8 w-8 rounded object-contain shrink-0" />
              <span className="font-semibold text-sm leading-tight truncate">
                {practiceName}
              </span>
            </>
          ) : (
            <img src={logoUrl} alt={practiceName} className="h-9 max-w-[180px] object-contain" />
          )
        ) : (
          <span className="font-semibold text-sm leading-tight truncate">
            {practiceName}
          </span>
        )}
      </Link>
      <nav className="flex-1 p-3 space-y-1">
        {sharedLinks.map((link) => (
          <NavItem
            key={link.href}
            link={link}
            active={pathname === link.href || pathname.startsWith(link.href + "/")}
          />
        ))}

        {isAdmin && (
          <>
            <div className="pt-4 pb-1 px-3">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                <Shield className="h-3 w-3" />
                Admin
              </div>
            </div>
            {adminOnlyLinks.map((link) => (
              <NavItem
                key={link.href}
                link={link}
                active={pathname === link.href || pathname.startsWith(link.href + "/")}
                badge={link.href === "/requests" ? openRequestCount : undefined}
                hasNew={link.href === "/requests" && newRequestCount > 0}
              />
            ))}
          </>
        )}
      </nav>
    </aside>
  );
}
