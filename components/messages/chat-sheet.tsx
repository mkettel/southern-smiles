"use client";

import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { ConversationList } from "./conversation-list";
import { MessageThread } from "./message-thread";
import { useMessagesRealtime } from "@/lib/hooks/use-messages-realtime";
import type { Profile, ConversationListItem, Message } from "@/lib/types";

type ChatSize = "sm" | "md" | "lg";

interface ChatSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: Profile;
  initialConversations: ConversationListItem[];
  practiceMembers: Profile[];
  size: ChatSize;
  onSizeChange: (size: ChatSize) => void;
}

export function ChatSheet({
  open,
  onOpenChange,
  profile,
  initialConversations,
  practiceMembers,
  size,
  onSizeChange,
}: ChatSheetProps) {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState(initialConversations);
  const openRef = useRef(open);
  openRef.current = open;
  const activeConvRef = useRef(activeConversationId);
  activeConvRef.current = activeConversationId;

  // Ref for pushing realtime messages into the active thread
  const threadMessageHandlerRef = useRef<((message: Message) => void) | null>(null);

  const activeItem = conversations.find(
    (c) => c.conversation.id === activeConversationId
  );

  const handleSelectConversation = useCallback((id: string) => {
    setActiveConversationId(id);
    setConversations((prev) =>
      prev.map((c) =>
        c.conversation.id === id ? { ...c, unreadCount: 0 } : c
      )
    );
  }, []);

  const handleBack = useCallback(() => {
    setActiveConversationId(null);
  }, []);

  const handleConversationCreated = useCallback(
    (item: ConversationListItem) => {
      setConversations((prev) => {
        if (prev.some((c) => c.conversation.id === item.conversation.id)) return prev;
        return [item, ...prev];
      });
      setActiveConversationId(item.conversation.id);
    },
    []
  );

  const handleNewMessage = useCallback(
    (conversationId: string, preview: string) => {
      setConversations((prev) => {
        const updated = prev.map((c) => {
          if (c.conversation.id !== conversationId) return c;
          return {
            ...c,
            conversation: {
              ...c.conversation,
              updated_at: new Date().toISOString(),
            },
            lastMessage: {
              id: "temp",
              conversation_id: conversationId,
              sender_id: "",
              practice_id: "",
              content: preview,
              mentions: [],
              created_at: new Date().toISOString(),
            },
            unreadCount:
              conversationId === activeConvRef.current
                ? 0
                : c.unreadCount + 1,
          };
        });
        return updated.sort(
          (a, b) =>
            new Date(b.conversation.updated_at).getTime() -
            new Date(a.conversation.updated_at).getTime()
        );
      });
    },
    []
  );

  // Build a profile lookup for enriching realtime messages
  const profileMap = useRef(
    new Map<string, Profile>(
      [profile, ...practiceMembers].map((p) => [p.id, p])
    )
  );

  const handleRealtimeMessage = useCallback(
    (rawMessage: Message) => {
      // Enrich with sender profile (realtime payload is raw DB row, no joins)
      const enriched: Message = {
        ...rawMessage,
        sender: profileMap.current.get(rawMessage.sender_id) ?? undefined,
      };

      // Update conversation list
      handleNewMessage(enriched.conversation_id, enriched.content);

      // If viewing this conversation, push message into the thread
      const isViewingConversation =
        openRef.current && activeConvRef.current === enriched.conversation_id;

      if (isViewingConversation && threadMessageHandlerRef.current) {
        threadMessageHandlerRef.current(enriched);
      }

      // Toast notifications
      if (!isViewingConversation) {
        const senderName = enriched.sender?.full_name ?? "Someone";
        const isMentioned = enriched.mentions?.includes(profile.id);
        if (isMentioned) {
          toast(`@${senderName} mentioned you`, {
            description:
              enriched.content.length > 80
                ? enriched.content.slice(0, 80) + "..."
                : enriched.content,
          });
        } else if (!openRef.current) {
          toast(`New message from ${senderName}`, {
            description:
              enriched.content.length > 80
                ? enriched.content.slice(0, 80) + "..."
                : enriched.content,
          });
        }
      }
    },
    [profile.id, handleNewMessage]
  );

  useMessagesRealtime({
    practiceId: profile.practice_id,
    userId: profile.id,
    onNewMessage: handleRealtimeMessage,
  });

  return (
    <div className="flex flex-col h-full">
      {activeConversationId && activeItem ? (
        <MessageThread
          conversationItem={activeItem}
          profile={profile}
          practiceMembers={practiceMembers}
          onBack={handleBack}
          onNewMessage={handleNewMessage}
          onRegisterRealtimeHandler={(handler) => {
            threadMessageHandlerRef.current = handler;
          }}
          onUnregisterRealtimeHandler={() => {
            threadMessageHandlerRef.current = null;
          }}
        />
      ) : (
        <ConversationList
          conversations={conversations}
          profile={profile}
          practiceMembers={practiceMembers}
          onSelect={handleSelectConversation}
          onConversationCreated={handleConversationCreated}
          onClose={() => onOpenChange(false)}
          size={size}
          onSizeChange={onSizeChange}
        />
      )}
    </div>
  );
}
