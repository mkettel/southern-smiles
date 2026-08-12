"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { logout } from "@/actions/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { Profile } from "@/lib/types";
import type { WorkspaceAccess } from "@/lib/workspace-access";
import { MobileNav } from "./mobile-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { ChangelogBell } from "@/components/changelog/changelog-bell";
import { TasksBell } from "@/components/tasks/tasks-bell";
import { CommandPaletteButton } from "@/components/command-palette/command-palette-button";

interface HeaderProps {
  profile: Profile;
  openRequestCount?: number;
  newRequestCount?: number;
  practiceName?: string;
  unreadChangelogCount?: number;
  activeTaskCount?: number;
  canAccessBills?: boolean;
  canAccessSupplies?: boolean;
  canAccessFinancial?: boolean;
  workspaceAccess: WorkspaceAccess;
}

export function Header({
  profile,
  openRequestCount = 0,
  newRequestCount = 0,
  practiceName,
  unreadChangelogCount = 0,
  activeTaskCount = 0,
  canAccessBills = false,
  canAccessSupplies = false,
  canAccessFinancial = false,
  workspaceAccess,
}: HeaderProps) {
  const router = useRouter();
  const [imgError, setImgError] = useState(false);
  const names = (profile.full_name || "").split(" ").filter(Boolean);
  const initials = names
    .map((n) => n[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";

  const showAvatar = profile.avatar_url && !imgError;

  return (
    <header className="flex h-14 items-center justify-between border-b px-4 md:justify-end gap-2">
      <MobileNav role={profile.role} openRequestCount={openRequestCount} newRequestCount={newRequestCount} practiceName={practiceName} canAccessBills={canAccessBills} canAccessSupplies={canAccessSupplies} canAccessFinancial={canAccessFinancial} workspaceAccess={workspaceAccess} />
      <div className="flex items-center gap-1">
        <CommandPaletteButton />
        <ThemeToggle />
        <TasksBell initialActiveCount={activeTaskCount} />
        <ChangelogBell initialUnreadCount={unreadChangelogCount} />
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-muted transition-colors outline-none">
          {showAvatar ? (
            <Image
              src={profile.avatar_url!}
              alt={profile.full_name}
              width={28}
              height={28}
              className="h-7 w-7 rounded-full object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium text-white"
              style={{ backgroundColor: profile.avatar_color ?? "#6b7280" }}
            >
              {initials}
            </span>
          )}
          <span className="hidden sm:inline-block">
            {profile.full_name}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            className="text-muted-foreground text-xs"
            disabled
          >
            {profile.email}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => router.push("/profile")}
          >
            My Profile
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={async () => {
              await logout();
              router.refresh();
            }}
          >
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      </div>
    </header>
  );
}
