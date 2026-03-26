"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Hash, Plus, X } from "lucide-react";
import Image from "next/image";
import { formatDistanceToNow } from "date-fns";
import { getOrCreateDM, createChannel } from "@/actions/messages";
import { toast } from "sonner";
import type { Profile, ConversationListItem } from "@/lib/types";

type ChatSize = "sm" | "md" | "lg";

interface ConversationListProps {
  conversations: ConversationListItem[];
  profile: Profile;
  practiceMembers: Profile[];
  onSelect: (id: string) => void;
  onConversationCreated: (item: ConversationListItem) => void;
  onClose: () => void;
  size: ChatSize;
  onSizeChange: (size: ChatSize) => void;
}

export function ConversationList({
  conversations,
  profile,
  practiceMembers,
  onSelect,
  onConversationCreated,
  onClose,
  size,
  onSizeChange,
}: ConversationListProps) {
  const [showNewDM, setShowNewDM] = useState(false);
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [channelName, setChannelName] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleStartDM(memberId: string) {
    setCreating(true);
    const result = await getOrCreateDM(memberId);
    if (result.error) {
      toast.error(result.error);
    } else if (result.conversation) {
      const member = practiceMembers.find((m) => m.id === memberId);
      onConversationCreated({
        conversation: result.conversation,
        otherMember: member,
        lastMessage: null,
        unreadCount: 0,
      });
      setShowNewDM(false);
    }
    setCreating(false);
  }

  async function handleCreateChannel() {
    if (!channelName.trim()) return;
    setCreating(true);
    const result = await createChannel(channelName.trim());
    if (result.error) {
      toast.error(result.error);
    } else if (result.conversation) {
      onConversationCreated({
        conversation: result.conversation,
        lastMessage: null,
        unreadCount: 0,
      });
      setShowNewChannel(false);
      setChannelName("");
    }
    setCreating(false);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h2 className="font-semibold text-sm">Messages</h2>
        <div className="flex items-center gap-0.5">
          {/* Size pill */}
          <div className="flex items-center rounded-full border text-[10px] font-medium overflow-hidden">
            {(["sm", "md", "lg"] as const).map((s) => (
              <button
                key={s}
                onClick={() => onSizeChange(s)}
                className={`px-2 py-0.5 uppercase transition-colors ${
                  size === s
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="w-px h-4 bg-border mx-0.5" />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              setShowNewDM(true);
              setShowNewChannel(false);
            }}
            title="New message"
          >
            <Plus className="h-4 w-4" />
          </Button>
          {profile.role === "admin" && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                setShowNewChannel(true);
                setShowNewDM(false);
              }}
              title="New channel"
            >
              <Hash className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* New DM picker */}
      {showNewDM && (
        <div className="border-b px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">New message</p>
            <Button variant="ghost" size="icon-sm" onClick={() => setShowNewDM(false)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
          <div className="space-y-1">
            {practiceMembers.map((member) => (
              <button
                key={member.id}
                onClick={() => handleStartDM(member.id)}
                disabled={creating}
                className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors text-left"
              >
                <MemberAvatar member={member} size={24} />
                <span>{member.full_name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* New Channel form */}
      {showNewChannel && (
        <div className="border-b px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">New channel</p>
            <Button variant="ghost" size="icon-sm" onClick={() => setShowNewChannel(false)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
          <div className="flex gap-2">
            <input
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              placeholder="Channel name"
              className="flex-1 rounded-md border bg-background px-2 py-1 text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleCreateChannel()}
            />
            <Button size="sm" onClick={handleCreateChannel} disabled={creating || !channelName.trim()}>
              Create
            </Button>
          </div>
        </div>
      )}

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            No conversations yet
          </div>
        ) : (
          conversations.map((item) => (
            <ConversationItem
              key={item.conversation.id}
              item={item}
              profile={profile}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ConversationItem({
  item,
  profile,
  onSelect,
}: {
  item: ConversationListItem;
  profile: Profile;
  onSelect: (id: string) => void;
}) {
  const { conversation, otherMember, lastMessage, unreadCount } = item;
  const isChannel = conversation.type === "channel";
  const displayName = isChannel
    ? conversation.name
    : otherMember?.full_name ?? "Unknown";

  const preview = lastMessage?.content
    ? lastMessage.content.length > 50
      ? lastMessage.content.slice(0, 50) + "..."
      : lastMessage.content
    : "No messages yet";

  const timeAgo = lastMessage
    ? formatDistanceToNow(new Date(lastMessage.created_at), { addSuffix: true })
    : "";

  return (
    <button
      onClick={() => onSelect(conversation.id)}
      className="flex items-start gap-3 w-full px-4 py-3 hover:bg-muted/50 transition-colors text-left border-b border-border/50"
    >
      {/* Avatar */}
      {isChannel ? (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
          <Hash className="h-4 w-4" />
        </span>
      ) : otherMember ? (
        <MemberAvatar member={otherMember} size={36} />
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
          ?
        </span>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-sm truncate ${unreadCount > 0 ? "font-semibold" : ""}`}>
            {displayName}
          </span>
          {timeAgo && (
            <span className="text-xs text-muted-foreground shrink-0">{timeAgo}</span>
          )}
        </div>
        <p className={`text-xs truncate ${unreadCount > 0 ? "text-foreground" : "text-muted-foreground"}`}>
          {preview}
        </p>
      </div>

      {/* Unread badge */}
      {unreadCount > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-medium text-primary-foreground shrink-0">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </button>
  );
}

function MemberAvatar({ member, size }: { member: Profile; size: number }) {
  const [imgError, setImgError] = useState(false);
  const names = (member.full_name || "").split(" ").filter(Boolean);
  const initials =
    names
      .map((n) => n[0] ?? "")
      .join("")
      .toUpperCase()
      .slice(0, 2) || "?";

  if (member.avatar_url && !imgError) {
    return (
      <Image
        src={member.avatar_url}
        alt={member.full_name}
        width={size}
        height={size}
        className="rounded-full object-cover shrink-0"
        style={{ height: size, width: size }}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <span
      className="flex items-center justify-center rounded-full text-white shrink-0"
      style={{
        backgroundColor: member.avatar_color ?? "#6b7280",
        height: size,
        width: size,
        fontSize: size * 0.35,
      }}
    >
      {initials}
    </span>
  );
}

export { MemberAvatar };
