"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
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
  Mailbox,
  ReceiptText,
  BadgeDollarSign,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface SidebarProps {
  role: UserRole;
  openRequestCount?: number;
  newRequestCount?: number;
  practiceName?: string;
  logoUrl?: string | null;
  showNameWithLogo?: boolean;
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
  { href: "/admin/surveys", label: "Patient Surveys", icon: Mailbox },
  { href: "/admin/export", label: "Export & Analyze", icon: Download },
  { href: "/admin/employees", label: "Manage Team", icon: Settings },
  { href: "/admin/updates", label: "Updates", icon: Bell },
  { href: "/requests", label: "Requests", icon: MessageSquarePlus },
  { href: "/admin/settings", label: "Settings", icon: Wrench },
];

const billsOfficerLinks: NavLink[] = [
  { href: "/admin/bills", label: "Bills", icon: ReceiptText },
];

const STORAGE_KEY = "sidebar-collapsed";
const EXPANDED_W = 224; // sidebar visual width when expanded
const COLLAPSED_W = 64;
const FLOAT_INSET = 8; // px gap between sidebar and viewport edges
// Spring-like easing — slight overshoot at the end for tactile feedback.
const SPRING_EASING = "cubic-bezier(0.34, 1.4, 0.64, 1)";
const TRANSITION_MS = 320;

function NavItem({
  link,
  active,
  badge,
  hasNew,
  collapsed,
}: {
  link: NavLink;
  active: boolean;
  badge?: number;
  hasNew?: boolean;
  collapsed: boolean;
}) {
  const Icon = link.icon;
  const showBadge = badge !== undefined && badge > 0;

  const content = (
    <Link
      href={link.href}
      className={cn(
        "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        collapsed && "justify-center px-2",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{link.label}</span>
          {showBadge && (
            <span
              className={cn(
                "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold",
                hasNew
                  ? "bg-blue-500 text-white"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {badge}
            </span>
          )}
        </>
      )}
      {collapsed && showBadge && (
        <span
          className={cn(
            "absolute right-1 top-1 h-2 w-2 rounded-full",
            hasNew ? "bg-blue-500" : "bg-muted-foreground/60",
          )}
          aria-hidden
        />
      )}
    </Link>
  );

  if (!collapsed) return content;

  return (
    <Tooltip>
      <TooltipTrigger render={content} />
      <TooltipContent side="right" sideOffset={12}>
        <span className="flex items-center gap-2">
          {link.label}
          {showBadge && (
            <span className="rounded-sm bg-background/20 px-1 text-[10px] font-semibold">
              {badge}
            </span>
          )}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

export function Sidebar({
  role,
  openRequestCount = 0,
  newRequestCount = 0,
  practiceName = "Stats & Conditions",
  logoUrl,
  showNameWithLogo = true,
  canAccessBills = false,
}: SidebarProps) {
  const pathname = usePathname();
  const isAdmin = role === "admin";
  const accessLinks = isAdmin ? adminOnlyLinks : canAccessBills ? billsOfficerLinks : [];
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Org Board opens in focus mode. Other routes retain the user's saved choice.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(pathname === "/org-board" || saved === "1");
    } catch {
      setCollapsed(pathname === "/org-board");
    }
    setHydrated(true);
  }, [pathname]);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  const sidebarWidth = collapsed ? COLLAPSED_W : EXPANDED_W;
  // Spacer keeps the parent flex layout reserving the right amount of width
  // even though the actual sidebar is positioned fixed.
  const spacerWidth = sidebarWidth + FLOAT_INSET * 2;

  return (
    <TooltipProvider delay={250}>
      {/* In-flow spacer — preserves layout.tsx's flexbox geometry. */}
      <div
        className="hidden md:block shrink-0"
        style={{
          width: spacerWidth,
          transition: hydrated
            ? `width ${TRANSITION_MS}ms ${SPRING_EASING}`
            : undefined,
        }}
        aria-hidden
      />

      {/* Floating sidebar — visually detached from the viewport edges. */}
      <aside
        className="hidden md:flex fixed z-30 flex-col rounded-xl border bg-background/95 backdrop-blur shadow-lg"
        style={{
          top: FLOAT_INSET,
          bottom: FLOAT_INSET,
          left: FLOAT_INSET,
          width: sidebarWidth,
          transition: hydrated
            ? `width ${TRANSITION_MS}ms ${SPRING_EASING}`
            : undefined,
        }}
      >
        {/* Edge toggle — always visible affordance for collapse / expand. */}
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={toggle}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                className="absolute -right-3 top-6 z-10 flex h-6 w-6 items-center justify-center rounded-full border bg-background shadow-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                {collapsed ? (
                  <ChevronRight className="h-3.5 w-3.5" />
                ) : (
                  <ChevronLeft className="h-3.5 w-3.5" />
                )}
              </button>
            }
          />
          <TooltipContent side="right" sideOffset={10}>
            {collapsed ? "Expand sidebar" : "Collapse sidebar"}
          </TooltipContent>
        </Tooltip>
        {/* Header / brand — cross-fades between full logo and tooth icon. */}
        <Link
          href="/dashboard"
          className="relative flex h-16 items-center justify-center border-b px-3 overflow-hidden"
          aria-label={practiceName}
        >
          {/* Expanded brand: full-width logo (or practice name fallback). */}
          <div
            className="absolute inset-0 flex items-center justify-center px-3"
            style={{
              opacity: collapsed ? 0 : 1,
              transform: collapsed ? "scale(0.92)" : "scale(1)",
              pointerEvents: collapsed ? "none" : "auto",
              transition: hydrated
                ? `opacity ${TRANSITION_MS}ms ${SPRING_EASING}, transform ${TRANSITION_MS}ms ${SPRING_EASING}`
                : undefined,
            }}
            aria-hidden={collapsed}
          >
            {logoUrl ? (
              <div className="flex w-full flex-col items-center gap-0.5">
                <img
                  src={logoUrl}
                  alt={showNameWithLogo ? "" : practiceName}
                  className="max-h-10 w-full object-contain"
                />
                {showNameWithLogo && (
                  <span className="text-[11px] font-semibold leading-tight truncate text-muted-foreground">
                    {practiceName}
                  </span>
                )}
              </div>
            ) : (
              <span className="font-semibold text-sm leading-tight truncate">
                {practiceName}
              </span>
            )}
          </div>

          {/* Collapsed brand: tooth icon. */}
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              opacity: collapsed ? 1 : 0,
              transform: collapsed ? "scale(1)" : "scale(0.6)",
              pointerEvents: collapsed ? "auto" : "none",
              transition: hydrated
                ? `opacity ${TRANSITION_MS}ms ${SPRING_EASING}, transform ${TRANSITION_MS}ms ${SPRING_EASING}`
                : undefined,
            }}
            aria-hidden={!collapsed}
          >
            <ToothLogo className="h-7 w-7 text-primary" />
          </div>
        </Link>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-1">
          {sharedLinks.map((link) => (
            <NavItem
              key={link.href}
              link={link}
              active={
                pathname === link.href ||
                pathname.startsWith(link.href + "/")
              }
              collapsed={collapsed}
            />
          ))}

          {accessLinks.length > 0 && (
            <>
              <div className={cn("pt-4 pb-1", collapsed ? "px-0" : "px-3")}>
                {collapsed ? (
                  <div className="mx-auto h-px w-6 bg-border" />
                ) : (
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                    <Shield className="h-3 w-3" />
                    Admin
                  </div>
                )}
              </div>
              {accessLinks.map((link) => (
                <NavItem
                  key={link.href}
                  link={link}
                  active={
                    pathname === link.href ||
                    pathname.startsWith(link.href + "/")
                  }
                  badge={
                    link.href === "/requests" ? openRequestCount : undefined
                  }
                  hasNew={link.href === "/requests" && newRequestCount > 0}
                  collapsed={collapsed}
                />
              ))}
            </>
          )}
        </nav>

      </aside>
    </TooltipProvider>
  );
}

/** Flat tooth icon used as the collapsed-mode brand mark. */
function ToothLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 56 64"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M14 4 Q6 4 4 14 Q2 24 6 34 Q8 42 12 54 Q14 60 18 58 Q22 56 22 46 Q22 40 26 40 Q30 40 30 46 Q30 56 34 58 Q38 60 40 54 Q44 42 46 34 Q50 24 48 14 Q46 4 38 4 Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
