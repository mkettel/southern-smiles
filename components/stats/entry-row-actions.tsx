"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Trash2, Check, X, Loader2 } from "lucide-react";
import { deleteStatEntry, updateStatEntry } from "@/actions/stat-entries";
import { Input } from "@/components/ui/input";
import type { StatType } from "@/lib/types";

interface EntryRowActionsProps {
  entryId: string;
  currentValue: number;
  statType: StatType;
  contributorName: string;
}

/**
 * Admin-only inline edit/delete controls for a single stat_entry row.
 * Parent decides when to render this (visibility is gated by isAdmin upstream).
 */
export function EntryRowActions({
  entryId,
  currentValue,
  statType,
  contributorName,
}: EntryRowActionsProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(currentValue));
  const [pending, startTransition] = useTransition();

  function handleSave() {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      toast.error("Enter a valid number");
      return;
    }
    startTransition(async () => {
      const result = await updateStatEntry(entryId, parsed);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Updated");
        setEditing(false);
      }
    });
  }

  function handleDelete() {
    if (
      !window.confirm(
        `Delete ${contributorName}'s entry of ${currentValue}${statType === "percentage" ? "%" : ""}? This can't be undone.`
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await deleteStatEntry(entryId);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Deleted");
      }
    });
  }

  if (editing) {
    return (
      <div
        className="inline-flex items-center gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        <Input
          type="number"
          step="any"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="h-7 w-20 text-xs"
          autoFocus
          disabled={pending}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") {
              setEditing(false);
              setDraft(String(currentValue));
            }
          }}
        />
        <button
          onClick={handleSave}
          disabled={pending}
          className="p-1 rounded text-green-600 hover:bg-green-50 dark:hover:bg-green-950 disabled:opacity-50"
          aria-label="Save"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          onClick={() => {
            setEditing(false);
            setDraft(String(currentValue));
          }}
          disabled={pending}
          className="p-1 rounded text-muted-foreground hover:bg-muted disabled:opacity-50"
          aria-label="Cancel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      className="inline-flex items-center gap-0.5"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={() => setEditing(true)}
        disabled={pending}
        className="p-1.5 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
        aria-label="Edit value"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={handleDelete}
        disabled={pending}
        className="p-1.5 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50"
        aria-label="Delete entry"
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}
