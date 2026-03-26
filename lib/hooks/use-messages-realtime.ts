"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/lib/types";

interface UseMessagesRealtimeOptions {
  practiceId: string;
  userId: string;
  onNewMessage: (message: Message) => void;
}

export function useMessagesRealtime({
  practiceId,
  userId,
  onNewMessage,
}: UseMessagesRealtimeOptions) {
  useEffect(() => {
    if (!practiceId) return;

    const supabase = createClient();

    const channel = supabase
      .channel(`messages:${practiceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `practice_id=eq.${practiceId}`,
        },
        (payload) => {
          const newMessage = payload.new as Message;
          // Don't duplicate messages sent by the current user
          // (they're already added optimistically)
          if (newMessage.sender_id === userId) return;
          onNewMessage(newMessage);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [practiceId, userId, onNewMessage]);
}
