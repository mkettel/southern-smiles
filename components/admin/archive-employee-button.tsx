"use client";

import { useState } from "react";
import { toast } from "sonner";
import { updateProfile } from "@/actions/admin";
import { UserX, UserCheck } from "lucide-react";

interface ArchiveEmployeeButtonProps {
  profileId: string;
  isActive: boolean;
  fullName: string;
}

export function ArchiveEmployeeButton({
  profileId,
  isActive,
  fullName,
}: ArchiveEmployeeButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleToggle() {
    if (
      isActive &&
      !window.confirm(
        `Archive ${fullName}? They won't be able to log in, but their data will be preserved.`
      )
    ) {
      return;
    }

    setLoading(true);
    const result = await updateProfile(profileId, {
      is_active: !isActive,
    });

    if (result.error) {
      toast.error(
        typeof result.error === "string" ? result.error : "Failed"
      );
    } else {
      toast.success(
        isActive
          ? `${fullName} has been archived`
          : `${fullName} has been reactivated`
      );
    }
    setLoading(false);
  }

  return (
    <span className="relative group/archive">
      <button
        onClick={handleToggle}
        disabled={loading}
        className="p-1.5 rounded text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
      >
        {isActive ? (
          <UserX className="h-3.5 w-3.5 group-hover/archive:text-destructive" />
        ) : (
          <UserCheck className="h-3.5 w-3.5 group-hover/archive:text-green-600" />
        )}
      </button>
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-0.5 rounded text-[10px] font-medium bg-foreground text-background whitespace-nowrap opacity-0 group-hover/archive:opacity-100 transition-opacity pointer-events-none z-10">
        {isActive ? "Archive employee" : "Reactivate employee"}
      </span>
    </span>
  );
}
