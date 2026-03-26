"use client";

import { MemberAvatar } from "./conversation-list";
import type { Profile } from "@/lib/types";

interface MentionDropdownProps {
  query: string;
  members: Profile[];
  onSelect: (member: Profile) => void;
  onClose: () => void;
}

export function MentionDropdown({
  query,
  members,
  onSelect,
  onClose,
}: MentionDropdownProps) {
  const filtered = members.filter((m) =>
    m.full_name.toLowerCase().includes(query.toLowerCase())
  );

  if (filtered.length === 0) return null;

  return (
    <div className="absolute bottom-full left-3 right-3 mb-1 rounded-md border bg-popover shadow-md overflow-hidden z-10">
      {filtered.map((member) => (
        <button
          key={member.id}
          onClick={() => onSelect(member)}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted transition-colors text-left"
        >
          <MemberAvatar member={member} size={20} />
          <span>{member.full_name}</span>
        </button>
      ))}
    </div>
  );
}
