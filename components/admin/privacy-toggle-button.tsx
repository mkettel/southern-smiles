"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { toggleStatPrivacy, toggleDivisionPrivacy } from "@/actions/admin";

interface PrivacyToggleButtonProps {
  id: string;
  isPrivate: boolean;
  target: "stat" | "division";
  label?: string;
}

export function PrivacyToggleButton({
  id,
  isPrivate,
  target,
  label,
}: PrivacyToggleButtonProps) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const action = target === "stat" ? toggleStatPrivacy : toggleDivisionPrivacy;
      const result = await action(id, !isPrivate);
      if (result.error) {
        toast.error(typeof result.error === "string" ? result.error : "Failed to update");
      } else {
        toast.success(
          !isPrivate
            ? `${label ?? "Item"} hidden from non-admins`
            : `${label ?? "Item"} visible to everyone`,
        );
      }
    });
  }

  const title = isPrivate
    ? "Private — only admins can see this. Click to make visible."
    : "Visible to everyone. Click to hide from non-admins.";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      title={title}
      aria-label={title}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted disabled:opacity-50 transition-colors"
    >
      {isPrivate ? (
        <EyeOff className="h-3.5 w-3.5" />
      ) : (
        <Eye className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
