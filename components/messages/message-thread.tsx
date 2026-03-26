"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMessages, markConversationSeen } from "@/actions/messages";
import { MessageBubble } from "./message-bubble";
import { MessageInput } from "./message-input";
import { MemberAvatar } from "./conversation-list";
import type { Profile, ConversationListItem, Message } from "@/lib/types";

interface MessageThreadProps {
  conversationItem: ConversationListItem;
  profile: Profile;
  practiceMembers: Profile[];
  onBack: () => void;
  onNewMessage: (conversationId: string, preview: string) => void;
  onRegisterRealtimeHandler: (handler: (message: Message) => void) => void;
  onUnregisterRealtimeHandler: () => void;
}

export function MessageThread({
  conversationItem,
  profile,
  practiceMembers,
  onBack,
  onNewMessage,
  onRegisterRealtimeHandler,
  onUnregisterRealtimeHandler,
}: MessageThreadProps) {
  const { conversation, otherMember } = conversationItem;
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const isChannel = conversation.type === "channel";
  const displayName = isChannel
    ? conversation.name
    : otherMember?.full_name ?? "Unknown";

  // Register handler for incoming realtime messages
  const handleIncomingMessage = useCallback((message: Message) => {
    setMessages((prev) => {
      // Avoid duplicates
      if (prev.some((m) => m.id === message.id)) return prev;
      return [...prev, message];
    });
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    markConversationSeen(conversation.id);
  }, [conversation.id]);

  useEffect(() => {
    onRegisterRealtimeHandler(handleIncomingMessage);
    return () => onUnregisterRealtimeHandler();
  }, [handleIncomingMessage, onRegisterRealtimeHandler, onUnregisterRealtimeHandler]);

  // Load initial messages and mark as seen
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const msgs = await getMessages(conversation.id);
      if (!cancelled) {
        setMessages(msgs);
        setHasMore(msgs.length >= 50);
        setLoading(false);
        setTimeout(() => bottomRef.current?.scrollIntoView(), 50);
      }
      markConversationSeen(conversation.id);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [conversation.id]);

  // Load older messages on scroll up
  const loadMore = useCallback(async () => {
    if (!hasMore || loading || messages.length === 0) return;
    const cursor = messages[0]?.created_at;
    const older = await getMessages(conversation.id, cursor);
    if (older.length < 50) setHasMore(false);
    setMessages((prev) => [...older, ...prev]);
  }, [conversation.id, hasMore, loading, messages]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (el && el.scrollTop === 0 && hasMore) {
      loadMore();
    }
  }, [loadMore, hasMore]);

  const handleMessageSent = useCallback(
    (message: Message) => {
      setMessages((prev) => [...prev, message]);
      onNewMessage(conversation.id, message.content);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    },
    [conversation.id, onNewMessage]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-3 py-3">
        <Button variant="ghost" size="icon-sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        {isChannel ? (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted">
            <Hash className="h-3.5 w-3.5" />
          </span>
        ) : otherMember ? (
          <MemberAvatar member={otherMember} size={28} />
        ) : null}
        <span className="font-medium text-sm truncate">{displayName}</span>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-1"
      >
        {loading ? (
          <div className="flex items-center justify-center h-20 text-sm text-muted-foreground">
            Loading...
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-sm text-muted-foreground">
            No messages yet. Say hi!
          </div>
        ) : (
          <>
            {hasMore && (
              <button
                onClick={loadMore}
                className="w-full text-center text-xs text-muted-foreground py-2 hover:text-foreground"
              >
                Load older messages
              </button>
            )}
            {messages.map((msg, i) => {
              const prevMsg = i > 0 ? messages[i - 1] : null;
              const showSender =
                !prevMsg || prevMsg.sender_id !== msg.sender_id;
              return (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  isOwn={msg.sender_id === profile.id}
                  showSender={showSender}
                  practiceMembers={practiceMembers}
                />
              );
            })}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <MessageInput
        conversationId={conversation.id}
        practiceMembers={practiceMembers}
        onMessageSent={handleMessageSent}
      />
    </div>
  );
}
