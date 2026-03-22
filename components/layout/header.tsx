"use client";

import { useRouter } from "next/navigation";
import { logout } from "@/actions/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Profile } from "@/lib/types";
import { MobileNav } from "./mobile-nav";

interface HeaderProps {
  profile: Profile;
  openRequestCount?: number;
}

export function Header({ profile, openRequestCount = 0 }: HeaderProps) {
  const router = useRouter();
  const initials = profile.full_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="flex h-14 items-center justify-between border-b px-4 md:justify-end">
      <MobileNav role={profile.role} openRequestCount={openRequestCount} />
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-muted transition-colors outline-none">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium">
            {initials}
          </span>
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
    </header>
  );
}
