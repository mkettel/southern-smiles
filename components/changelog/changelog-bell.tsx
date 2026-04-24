"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, Lock, Globe, CheckCheck } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChangelogContent } from "./changelog-content";
import { TagChip } from "./tags";
import {
  listChangelog,
  markAllChangelogRead,
  markChangelogRead,
} from "@/actions/changelog";
import type { ChangelogEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ChangelogBellProps {
  initialUnreadCount: number;
}

export function ChangelogBell({ initialUnreadCount }: ChangelogBellProps) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnreadCount);
  const [entries, setEntries] = useState<ChangelogEntry[] | null>(null);
  const [, startTransition] = useTransition();

  // Sync the badge if a server refresh changes the prop.
  useEffect(() => {
    setUnread(initialUnreadCount);
  }, [initialUnreadCount]);

  async function load() {
    const data = await listChangelog();
    setEntries(data);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      load();
    } else if (entries) {
      // Auto-mark all visible unread entries as read on close.
      const unreadIds = entries.filter((e) => e.is_unread).map((e) => e.id);
      if (unreadIds.length > 0) {
        setUnread(0);
        setEntries((prev) =>
          prev ? prev.map((e) => ({ ...e, is_unread: false })) : prev
        );
        startTransition(async () => {
          await markChangelogRead(unreadIds);
        });
      }
    }
  }

  function handleMarkAllRead() {
    if (!entries) return;
    setUnread(0);
    setEntries(entries.map((e) => ({ ...e, is_unread: false })));
    startTransition(async () => {
      await markAllChangelogRead();
    });
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <TooltipProvider delay={250}>
        <Tooltip>
          <TooltipTrigger
            render={
              <SheetTrigger
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors outline-none"
                aria-label="Open changelog"
              />
            }
          >
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            Changelog{unread > 0 ? ` · ${unread} new` : ""}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <SheetContent
        side="right"
        className="w-full data-[side=right]:sm:max-w-xl flex flex-col gap-0 p-0"
      >
        <SheetHeader className="border-b">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Changelog
            </SheetTitle>
            {entries && entries.some((e) => e.is_unread) && (
              <button
                onClick={handleMarkAllRead}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <CheckCheck className="h-3 w-3" />
                Mark all read
              </button>
            )}
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {entries === null ? (
            <div className="text-xs text-muted-foreground">Loading…</div>
          ) : entries.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No updates yet.
            </div>
          ) : (
            <ol className="relative space-y-6 border-l border-border pl-5">
              {entries.map((entry) => (
                <li key={entry.id} className="relative">
                  <span
                    className={cn(
                      "absolute -left-[27px] top-1.5 inline-block h-3 w-3 rounded-full ring-4 ring-background",
                      entry.is_unread ? "bg-primary" : "bg-muted-foreground/40"
                    )}
                  />
                  <div
                    className={cn(
                      "rounded-lg border bg-card p-3 transition-colors",
                      entry.is_unread && "border-primary/40 bg-primary/[0.03]"
                    )}
                  >
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      {entry.tags.map((t) => (
                        <TagChip key={t} tag={t} />
                      ))}
                      {entry.visibility === "everyone" ? (
                        <span
                          className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground"
                          title="Visible to everyone"
                        >
                          <Globe className="h-2.5 w-2.5" /> Public
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground"
                          title="Admin-only"
                        >
                          <Lock className="h-2.5 w-2.5" /> Admin
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold text-sm leading-tight">
                      {entry.title}
                    </h3>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {formatTimestamp(entry.created_at)}
                      {entry.author?.full_name && ` · ${entry.author.full_name}`}
                    </p>
                    {entry.image_url && (
                      <img
                        src={entry.image_url}
                        alt=""
                        className="mt-2 rounded-md border max-h-64 w-full object-cover"
                      />
                    )}
                    <div className="mt-2">
                      <ChangelogContent body={entry.body} />
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.round(diffMs / 60000);
  const diffHr = Math.round(diffMs / 3600000);
  const diffDay = Math.round(diffMs / 86400000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: now.getFullYear() === d.getFullYear() ? undefined : "numeric",
  });
}
