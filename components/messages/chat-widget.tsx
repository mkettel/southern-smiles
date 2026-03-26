"use client";

import { useState, useEffect } from "react";
import { MessageCircle } from "lucide-react";
import { ChatSheet } from "./chat-sheet";
import type { Profile, ConversationListItem } from "@/lib/types";

type ChatSize = "sm" | "md" | "lg";

const SIZES: Record<ChatSize, { w: number; h: number }> = {
  sm: { w: 320, h: 420 },
  md: { w: 380, h: 560 },
  lg: { w: 480, h: 680 },
};

interface ChatWidgetProps {
  profile: Profile;
  initialConversations: ConversationListItem[];
  practiceMembers: Profile[];
  unreadMessageCount: number;
}

export function ChatWidget({
  profile,
  initialConversations,
  practiceMembers,
  unreadMessageCount,
}: ChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [size, setSize] = useState<ChatSize>("md");

  const isMac = typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");
  const shortcutLabel = isMac ? "\u2318B" : "Ctrl+B";

  // Cmd+B / Ctrl+B to toggle
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const { w, h } = SIZES[size];

  return (
    <>
      {/* Floating chat window */}
      {open && (
        <div
          className="fixed bottom-16 right-4 z-50 flex flex-col rounded-xl border bg-background shadow-2xl overflow-hidden animate-in fade-in-0 slide-in-from-bottom-4 duration-200"
          style={{
            width: w,
            height: h,
            transition: "width 300ms ease, height 300ms ease",
          }}
        >
          <ChatSheet
            open={open}
            onOpenChange={setOpen}
            profile={profile}
            initialConversations={initialConversations}
            practiceMembers={practiceMembers}
            size={size}
            onSizeChange={setSize}
          />
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border bg-background px-4 py-2.5 text-sm font-medium shadow-lg hover:bg-muted transition-colors"
      >
        <MessageCircle className="h-4 w-4" />
        <span>Messages</span>
        {unreadMessageCount > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-medium text-primary-foreground">
            {unreadMessageCount > 99 ? "99+" : unreadMessageCount}
          </span>
        )}
        <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">{shortcutLabel}</kbd>
      </button>
    </>
  );
}
