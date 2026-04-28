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
  executive: string | null;
  vfp: string | null;
  color: string;
  is_private: boolean;
  created_at: string;
  updated_at: string;
}

export interface Department {
  id: string;
  name: string;
  director: string | null;
  division_id: string;
  display_order: number;
  created_at: string;
  updated_at: string;
  // Joined
  sections?: Section[];
}

export interface Section {
  id: string;
  name: string;
  assignee: string | null;
  department_id: string;
  post_id: string | null;
  responsibilities: string[];
  display_order: number;
  created_at: string;
  updated_at: string;
  // Joined
  post?: Post;
}

export interface Post {
  id: string;
  title: string;
  vfp: string | null;
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
  is_private: boolean;
  /** Admin-assigned lifetime condition for this stat. Null = not set. */
  overall_condition: import("./conditions").ConditionName | null;
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

export type ChangelogVisibility = "admin" | "everyone";

export interface ChangelogEntry {
  id: string;
  practice_id: string;
  author_id: string;
  title: string;
  /** Tiptap JSON document */
  body: unknown;
  image_url: string | null;
  video_url: string | null;
  tags: string[];
  visibility: ChangelogVisibility;
  created_at: string;
  updated_at: string;
  // Joined / computed
  author?: Pick<Profile, "id" | "full_name" | "avatar_url" | "avatar_color">;
  is_unread?: boolean;
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
// Tasks (Command Center)
// ============================================================

export type TaskPriority = "low" | "normal" | "high";
export type TaskStatus = "assigned" | "in_progress" | "submitted" | "approved";

export interface Task {
  id: string;
  practice_id: string;
  created_by: string;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: TaskPriority;
  created_at: string;
  updated_at: string;
  // Joined
  creator?: Pick<Profile, "id" | "full_name" | "avatar_url" | "avatar_color">;
  assignments?: TaskAssignment[];
  comment_count?: number;
}

export interface TaskAssignment {
  id: string;
  task_id: string;
  profile_id: string;
  practice_id: string;
  status: TaskStatus;
  completed_at: string | null;
  approved_at: string | null;
  review_note: string | null;
  assigned_at: string;
  updated_at: string;
  // Joined
  profile?: Pick<Profile, "id" | "full_name" | "avatar_url" | "avatar_color">;
}

export interface TaskComment {
  id: string;
  task_id: string;
  profile_id: string;
  practice_id: string;
  message: string;
  created_at: string;
  // Joined
  profile?: Pick<Profile, "id" | "full_name" | "avatar_url" | "avatar_color">;
}

/**
 * View model used by /tasks (per-employee view): the task plus the
 * caller's own assignment row pulled out for convenience.
 */
export interface MyTaskItem {
  task: Task;
  assignment: TaskAssignment;
  coAssignees: TaskAssignment[];
  comment_count: number;
}

// ============================================================
// Composite / view types for the UI
// ============================================================

export interface ContributorEntry {
  profileName: string;
  value: number;
}

export interface DashboardStat {
  stat: Stat;
  post: Post;
  division: Division;
  employee: Profile;
  currentEntry: StatEntry | null;
  previousEntry: StatEntry | null;
  sparklineData: { week: string; value: number }[];
  /** Individual contributor values when multiple employees submit for the same week */
  contributors?: ContributorEntry[];
  /**
   * Auto-calculated lifetime condition + the math that produced it
   * (latest week vs. all-time historical avg). Null when there isn't enough
   * history. The admin override (stat.overall_condition) wins for display,
   * but this is shown alongside in the picker so they can see what the
   * computer would say.
   */
  overallAuto: {
    condition: import("./conditions").ConditionName;
    latest: number;
    baseline: number;
    percentChange: number;
    baselineWeeks: number;
  } | null;
}

export interface MyStatForEntry {
  stat: Stat;
  post: Post;
  previousValue: number | null;
  previousWeekStart: string | null;
  existingEntry: StatEntry | null;
}

export interface OtherStatForEntry {
  stat: Stat;
  post: Post;
  employee: Profile;
  previousValue: number | null;
  previousWeekStart: string | null;
  existingEntry: StatEntry | null;
}
