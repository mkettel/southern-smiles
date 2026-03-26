import type { ConditionName, GoodDirection } from "./conditions";

// ============================================================
// Database row types
// ============================================================

export type StatType = "dollar" | "percentage" | "count";
export type UserRole = "admin" | "employee";

export interface Division {
  id: string;
  number: number;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Post {
  id: string;
  title: string;
  division_id: string;
  created_at: string;
  updated_at: string;
  // Joined
  division?: Division;
}

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  username: string | null;
  avatar_url: string | null;
  avatar_color: string | null;
  role: UserRole;
  practice_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmployeePost {
  id: string;
  profile_id: string;
  post_id: string;
  assigned_at: string;
  // Joined
  post?: Post;
  profile?: Profile;
}

export interface Stat {
  id: string;
  name: string;
  abbreviation: string | null;
  description: string | null;
  stat_type: StatType;
  good_direction: GoodDirection;
  post_id: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  post?: Post;
}

export interface StatEntry {
  id: string;
  stat_id: string;
  profile_id: string;
  week_start: string;
  value: number;
  previous_value: number | null;
  percent_change: number | null;
  auto_condition: ConditionName | null;
  self_condition: ConditionName | null;
  final_condition: ConditionName | null;
  playbook_response: string | null;
  submitted_at: string;
  updated_at: string;
  // Joined
  stat?: Stat;
  profile?: Profile;
}

export interface ConditionPlaybook {
  id: string;
  condition: ConditionName;
  display_name: string;
  color: string;
  description: string;
  steps: string[];
  created_at: string;
  updated_at: string;
}

export interface OicLogEntry {
  id: string;
  profile_id: string;
  effective_date: string;
  area: string | null;
  post_affected: string | null;
  entry_text: string;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
  // Joined
  profile?: Profile;
}

// ============================================================
// Messaging types
// ============================================================

export type ConversationType = "dm" | "channel";

export interface Conversation {
  id: string;
  practice_id: string;
  type: ConversationType;
  name: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Joined
  members?: ConversationMember[];
}

export interface ConversationMember {
  conversation_id: string;
  profile_id: string;
  practice_id: string;
  joined_at: string;
  // Joined
  profile?: Profile;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  practice_id: string;
  content: string;
  mentions: string[];
  created_at: string;
  // Joined
  sender?: Profile;
}

export interface ConversationLastSeen {
  conversation_id: string;
  profile_id: string;
  practice_id: string;
  seen_at: string;
}

export interface ConversationListItem {
  conversation: Conversation;
  otherMember?: Profile;
  lastMessage: Message | null;
  unreadCount: number;
}

// ============================================================
// Composite / view types for the UI
// ============================================================

export interface DashboardStat {
  stat: Stat;
  post: Post;
  division: Division;
  employee: Profile;
  currentEntry: StatEntry | null;
  previousEntry: StatEntry | null;
  sparklineData: { week: string; value: number }[];
}

export interface MyStatForEntry {
  stat: Stat;
  post: Post;
  previousValue: number | null;
  existingEntry: StatEntry | null;
}

export interface OtherStatForEntry {
  stat: Stat;
  post: Post;
  employee: Profile;
  previousValue: number | null;
  existingEntry: StatEntry | null;
}
