"use client";

import { formatDistanceToNow } from "date-fns";
import { MemberAvatar } from "./conversation-list";
import type { Message, Profile } from "@/lib/types";

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showSender: boolean;
  practiceMembers: Profile[];
}

export function MessageBubble({
  message,
  isOwn,
  showSender,
  practiceMembers,
}: MessageBubbleProps) {
  const sender = message.sender as Profile | undefined;

  // Render content with @mentions highlighted
  function renderContent(content: string) {
    // Match @[uuid] patterns
    const mentionRegex = /@\[([0-9a-f-]{36})\]/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = mentionRegex.exec(content)) !== null) {
      // Add text before mention
      if (match.index > lastIndex) {
        parts.push(content.slice(lastIndex, match.index));
      }
      // Find the mentioned user's name
      const mentionedId = match[1];
      const member = practiceMembers.find((m) => m.id === mentionedId) ?? sender;
      const displayName = member?.full_name ?? "Unknown";
      parts.push(
        <span
          key={match.index}
          className="bg-primary/15 text-primary font-medium rounded px-0.5"
        >
          @{displayName}
        </span>
      );
      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < content.length) {
      parts.push(content.slice(lastIndex));
    }

    return parts.length > 0 ? parts : content;
  }

  return (
    <div
      className={`group animate-in fade-in-0 slide-in-from-bottom-2 duration-200 ${showSender ? "mt-3" : "mt-0.5"}`}
    >
      {showSender && sender && (
        <div className="flex items-center gap-2 mb-1">
          <MemberAvatar member={sender} size={20} />
          <span className="text-xs font-medium">{sender.full_name}</span>
          <span className="text-[10px] text-muted-foreground">
            {formatDistanceToNow(new Date(message.created_at), {
              addSuffix: true,
            })}
          </span>
        </div>
      )}
      <div
        className={`text-sm pl-7 ${
          isOwn ? "bg-primary/5 rounded-md px-2 py-0.5 -ml-2" : ""
        }`}
      >
        <span className="whitespace-pre-wrap break-words">
          {renderContent(message.content)}
        </span>
      </div>
    </div>
  );
}
