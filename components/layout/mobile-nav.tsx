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
} from "lucide-react";

interface MobileNavProps {
  role: UserRole;
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
];

export function MobileNav({ role }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const links = role === "admin" ? adminLinks : employeeLinks;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className="inline-flex items-center justify-center rounded-md p-2 hover:bg-muted transition-colors md:hidden">
        <Menu className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <SheetTitle className="flex h-14 items-center border-b px-4 font-semibold text-lg">
          Southern Smiles
        </SheetTitle>
        <nav className="space-y-1 p-3">
          {links.map((link) => {
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
                {link.label}
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
