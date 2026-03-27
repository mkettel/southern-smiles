"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, Hash, CheckCheck, Check } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { getMessages, markConversationSeen, getOtherMemberSeenAt } from "@/actions/messages";
import { MessageBubble } from "./message-bubble";
import { MessageInput } from "./message-input";
import { MemberAvatar } from "./conversation-list";
import type { Profile, ConversationListItem, Message } from "@/lib/types";

interface MessageThreadProps {
  conversationItem: ConversationListItem;
  profile: Profile;
  practiceMembers: Profile[];
  onBack: () => void;
  onNewMessage: (conversationId: string, preview: string, senderId?: string) => void;
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
  const [otherSeenAt, setOtherSeenAt] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const isDM = conversation.type === "dm";
  const isChannel = conversation.type === "channel";
  const displayName = isChannel
    ? conversation.name
    : otherMember?.full_name ?? "Unknown";

  // Register handler for incoming realtime messages
  const handleIncomingMessage = useCallback((message: Message) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === message.id)) return prev;
      return [...prev, message];
    });
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    markConversationSeen(conversation.id);
    // If the other person sent a message, they've seen everything up to now
    if (isDM && message.sender_id === otherMember?.id) {
      setOtherSeenAt(message.created_at);
    }
  }, [conversation.id, isDM, otherMember?.id]);

  useEffect(() => {
    onRegisterRealtimeHandler(handleIncomingMessage);
    return () => onUnregisterRealtimeHandler();
  }, [handleIncomingMessage, onRegisterRealtimeHandler, onUnregisterRealtimeHandler]);

  // Load initial messages, mark as seen, fetch read receipt
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

      // Fetch other person's read receipt for DMs
      if (isDM && otherMember) {
        const seenAt = await getOtherMemberSeenAt(conversation.id, otherMember.id);
        if (!cancelled) setOtherSeenAt(seenAt);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [conversation.id, isDM, otherMember]);

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
      onNewMessage(conversation.id, message.content, message.sender_id);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    },
    [conversation.id, onNewMessage]
  );

  // Find the last own message to show delivery/read status (DMs only)
  const lastOwnMessageId = (() => {
    if (!isDM) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender_id === profile.id) return messages[i].id;
    }
    return null;
  })();

  const lastOwnMessageIsRead = (() => {
    if (!lastOwnMessageId || !otherSeenAt) return false;
    const msg = messages.find((m) => m.id === lastOwnMessageId);
    return msg ? msg.created_at <= otherSeenAt : false;
  })();

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
              const showReceipt = msg.id === lastOwnMessageId;
              return (
                <div key={msg.id}>
                  <MessageBubble
                    message={msg}
                    isOwn={msg.sender_id === profile.id}
                    showSender={showSender}
                    practiceMembers={practiceMembers}
                  />
                  {showReceipt && (
                    <div className="flex items-center justify-end gap-1 mt-0.5 mr-1">
                      {lastOwnMessageIsRead ? (
                        <>
                          <CheckCheck className="h-3 w-3 text-primary" />
                          <span className="text-[10px] text-muted-foreground">
                            Read {otherSeenAt ? format(new Date(otherSeenAt), "h:mm a") : ""}
                          </span>
                        </>
                      ) : (
                        <>
                          <Check className="h-3 w-3 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground">Delivered</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
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
