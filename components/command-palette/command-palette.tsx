"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Search, CornerDownLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { filterCommands, type CommandItem, type CommandActionId } from "./commands";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: CommandItem[];
  /** Invoked for `type: "action"` items. */
  onAction: (action: CommandActionId) => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  commands,
  onAction,
}: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => filterCommands(commands, query), [commands, query]);

  // Reset state on close so reopening starts clean.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  // Clamp the active index when the filtered list shrinks.
  useEffect(() => {
    if (activeIndex >= filtered.length) {
      setActiveIndex(filtered.length === 0 ? 0 : filtered.length - 1);
    }
  }, [filtered.length, activeIndex]);

  // Keep the active item scrolled into view while arrow-keying.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLElement>(`[data-cmd-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function executeItem(item: CommandItem) {
    onOpenChange(false);
    if (item.type === "navigate") {
      router.push(item.href);
    } else {
      onAction(item.action);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % Math.max(filtered.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) =>
        i === 0 ? Math.max(filtered.length - 1, 0) : i - 1
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = filtered[activeIndex];
      if (item) executeItem(item);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(Math.max(filtered.length - 1, 0));
    }
  }

  // Group items in render order while preserving the flat index used for kbd nav.
  const grouped = useMemo(() => {
    const groups: { name: string; items: { item: CommandItem; flatIndex: number }[] }[] = [];
    filtered.forEach((item, flatIndex) => {
      const last = groups[groups.length - 1];
      if (last && last.name === item.group) {
        last.items.push({ item, flatIndex });
      } else {
        groups.push({ name: item.group, items: [{ item, flatIndex }] });
      }
    });
    return groups;
  }, [filtered]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className="fixed inset-0 isolate z-50 bg-black/20 supports-backdrop-filter:backdrop-blur-xs duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
        />
        <DialogPrimitive.Popup
          className={cn(
            "fixed top-[20%] left-1/2 z-50 w-full max-w-[calc(100%-2rem)] -translate-x-1/2",
            "sm:max-w-lg overflow-hidden rounded-xl bg-popover text-popover-foreground",
            "ring-1 ring-foreground/10 shadow-2xl outline-none",
            "duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
            "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
          )}
          onKeyDown={handleKeyDown}
        >
          <DialogPrimitive.Title className="sr-only">
            Command palette
          </DialogPrimitive.Title>

          <div className="flex items-center gap-2 border-b px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              placeholder="Type a page or action…"
              className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              aria-label="Command palette search"
            />
          </div>

          <div
            ref={listRef}
            className="max-h-[60vh] overflow-y-auto p-1"
            role="listbox"
          >
            {filtered.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                No results for &ldquo;{query}&rdquo;
              </div>
            ) : (
              grouped.map((group) => (
                <div key={group.name} className="mb-1 last:mb-0">
                  <div className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.name}
                  </div>
                  {group.items.map(({ item, flatIndex }) => {
                    const Icon = item.icon;
                    const active = flatIndex === activeIndex;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-cmd-index={flatIndex}
                        role="option"
                        aria-selected={active}
                        onClick={() => executeItem(item)}
                        onMouseMove={() => setActiveIndex(flatIndex)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors",
                          active
                            ? "bg-primary/10 text-foreground"
                            : "text-foreground/90 hover:bg-muted/60"
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0",
                            active ? "text-primary" : "text-muted-foreground"
                          )}
                        />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.hint && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {item.hint}
                          </span>
                        )}
                        {active && (
                          <CornerDownLeft className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t bg-muted/40 px-3 py-2 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd>
                <span>navigate</span>
              </span>
              <span className="flex items-center gap-1">
                <Kbd>↵</Kbd>
                <span>select</span>
              </span>
              <span className="flex items-center gap-1">
                <Kbd>esc</Kbd>
                <span>close</span>
              </span>
            </div>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.25rem] items-center justify-center rounded border bg-background px-1 font-sans text-[10px] font-medium">
      {children}
    </kbd>
  );
}
