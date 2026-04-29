"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCommandPalette } from "./command-palette-provider";

export function CommandPaletteButton() {
  const { open } = useCommandPalette();
  const [isMac, setIsMac] = useState(true);

  // Detect platform once on mount so the kbd hint matches the user's OS.
  useEffect(() => {
    if (typeof navigator !== "undefined") {
      setIsMac(/mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent));
    }
  }, []);

  const modKey = isMac ? "⌘" : "Ctrl";

  return (
    <TooltipProvider>
      {/* Desktop: pill-shaped search affordance with kbd hint */}
      <button
        type="button"
        onClick={open}
        aria-label="Open command palette"
        className={cn(
          "hidden sm:inline-flex items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-1 text-xs",
          "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        )}
      >
        <Search className="h-3.5 w-3.5" />
        <span>Search…</span>
        <span className="ml-1 inline-flex items-center gap-0.5">
          <kbd className="rounded border bg-background px-1 font-sans text-[10px] font-medium">
            {modKey}
          </kbd>
          <kbd className="rounded border bg-background px-1 font-sans text-[10px] font-medium">
            K
          </kbd>
        </span>
      </button>

      {/* Mobile: icon-only button */}
      <Tooltip>
        <TooltipTrigger
          onClick={open}
          aria-label="Open command palette"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:hidden"
        >
          <Search className="h-4 w-4" />
        </TooltipTrigger>
        <TooltipContent side="bottom">Search & actions</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
