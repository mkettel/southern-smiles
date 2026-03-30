"use client";

import { useState, useRef, useCallback } from "react";
import { SendHorizonal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendMessage } from "@/actions/messages";
import { toast } from "sonner";
import { MentionDropdown } from "./mention-dropdown";
import type { Profile, Message } from "@/lib/types";

interface MessageInputProps {
  conversationId: string;
  practiceMembers: Profile[];
  onMessageSent: (message: Message) => void;
}

export function MessageInput({
  conversationId,
  practiceMembers,
  onMessageSent,
}: MessageInputProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStartIndex, setMentionStartIndex] = useState(0);
  // Track active mentions by display name -> profile id
  const mentionsRef = useRef<Map<string, string>>(new Map());
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setText(value);

      // Detect @mention trigger
      const cursorPos = e.target.selectionStart ?? value.length;
      const textBeforeCursor = value.slice(0, cursorPos);
      const atIndex = textBeforeCursor.lastIndexOf("@");

      if (atIndex >= 0) {
        const charBefore = atIndex > 0 ? textBeforeCursor[atIndex - 1] : " ";
        const query = textBeforeCursor.slice(atIndex + 1);
        // Only trigger if @ is at start or preceded by whitespace, and no space in query
        if ((charBefore === " " || charBefore === "\n" || atIndex === 0) && !query.includes(" ")) {
          // Don't trigger if the query matches an already-inserted mention name
          const isExistingMention = mentionsRef.current.has(query);
          if (!isExistingMention) {
            setMentionQuery(query);
            setMentionStartIndex(atIndex);
            return;
          }
        }
      }
      setMentionQuery(null);
    },
    []
  );

  const handleMentionSelect = useCallback(
    (member: Profile) => {
      const before = text.slice(0, mentionStartIndex);
      const after = text.slice(
        mentionStartIndex + 1 + (mentionQuery?.length ?? 0)
      );
      // Insert @DisplayName in the textarea (human-readable)
      const displayMention = `@${member.full_name}`;
      const newText = before + displayMention + " " + after;
      setText(newText);
      // Track this mention for conversion on send
      mentionsRef.current.set(member.full_name, member.id);
      setMentionQuery(null);
      textareaRef.current?.focus();
    },
    [text, mentionStartIndex, mentionQuery]
  );

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    // Convert @DisplayName back to @[uuid] for storage
    let content = trimmed;
    const mentions: string[] = [];
    for (const [name, id] of mentionsRef.current) {
      const displayMention = `@${name}`;
      if (content.includes(displayMention)) {
        content = content.replaceAll(displayMention, `@[${id}]`);
        mentions.push(id);
      }
    }

    setSending(true);
    const result = await sendMessage(conversationId, content, mentions);
    if (result.error) {
      toast.error(result.error);
    } else if (result.message) {
      onMessageSent(result.message);
      setText("");
      mentionsRef.current.clear();
    }
    setSending(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="relative border-t px-3 py-2">
      {mentionQuery !== null && (
        <MentionDropdown
          query={mentionQuery}
          members={practiceMembers}
          onSelect={handleMentionSelect}
          onClose={() => setMentionQuery(null)}
        />
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          className="flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring max-h-32 overflow-y-auto"
          style={{ minHeight: "2.25rem" }}
        />
        <Button
          size="icon-sm"
          onClick={handleSend}
          disabled={sending || !text.trim()}
        >
          <SendHorizonal className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground mt-1">
        Enter to send, Shift+Enter for new line. Type @ to mention.
        <span className="mx-1">·</span>
        <span className="text-destructive/70">Please do not share patient information here.</span>
      </p>
    </div>
  );
}
