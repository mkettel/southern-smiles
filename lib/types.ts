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
  /**
   * When false (default), the assignee marking a task "done" jumps
   * straight to approved — no admin review step. When true, it goes
   * to 'submitted' and waits for an admin approval.
   */
  requires_approval: boolean;
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

// ============================================================
// Patient surveys & referral insights
// ============================================================

export type SurveyQuestionType =
  | "rating"
  | "single_choice"
  | "multi_choice"
  | "text"
  | "referral_source";

export interface SurveyQuestion {
  id: string;
  type: SurveyQuestionType;
  label: string;
  options?: string[];
  required?: boolean;
}

export type CampaignStatus = "draft" | "active" | "closed";
export type CreditStatus = "none" | "promised" | "redeemed" | "expired";

export interface Patient {
  id: string;
  practice_id: string;
  full_name: string;
  first_name: string | null;
  phone: string | null;
  email: string | null;
  external_ref: string | null;
  // Metrics (migration 033) — derived from imported revenue/visit data
  total_collected_cents: number;
  visit_count: number;
  first_seen: string | null;
  last_seen: string | null;
  name_key: string | null;
  attributes: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** A patient aggregated from raw CSV rows, ready to upsert. */
export interface AggregatedPatient {
  full_name: string;
  first_name: string | null;
  name_key: string;
  email: string | null;
  phone: string | null;
  external_ref: string | null;
  total_collected_cents: number;
  visit_count: number;
  first_seen: string | null;
  last_seen: string | null;
  attributes: Record<string, unknown>;
}

export type DetectedColumnRole =
  | "name"
  | "currency"
  | "date"
  | "email"
  | "phone"
  | "external_ref"
  | "other";

export interface DetectedColumn {
  header: string;
  role: DetectedColumnRole;
}

export interface AggregationResult {
  patients: AggregatedPatient[];
  detected: DetectedColumn[];
  skipped: number;
}

export interface PatientFilters {
  search?: string;
  minValueCents?: number;
  lapsedMonths?: number;
  newWithinMonths?: number;
  repeatOnly?: boolean;
}

export type PatientSegment = "top_value" | "lapsed" | "repeat" | "new";

/** A patient row plus which campaigns they're already enrolled in. */
export interface PatientListItem extends Patient {
  enrolledCampaignIds: string[];
}

export interface SurveyCampaign {
  id: string;
  practice_id: string;
  title: string;
  questions: SurveyQuestion[];
  credit_amount_cents: number;
  credit_expires_days: number | null;
  status: CampaignStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SurveyRecipient {
  id: string;
  practice_id: string;
  campaign_id: string;
  patient_id: string;
  code: string;
  sent_at: string | null;
  responded_at: string | null;
  credit_status: CreditStatus;
  credit_amount_cents: number | null;
  credit_expires_at: string | null;
  credit_redeemed_at: string | null;
  credit_redeemed_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  patient?: Patient;
  campaign?: SurveyCampaign;
}

export interface SurveyResponse {
  id: string;
  practice_id: string;
  campaign_id: string;
  recipient_id: string;
  patient_id: string;
  answers: Record<string, unknown>;
  referral_source: string | null;
  submitted_at: string;
  // Joined
  patient?: Patient;
}

// View models for the admin insights dashboard
export interface CampaignStats {
  campaign: SurveyCampaign;
  recipientCount: number;
  sentCount: number;
  responseCount: number;
  responseRate: number; // responses ÷ sent (0 when none sent)
  creditPromisedCents: number;
  creditRedeemedCents: number;
  creditOutstandingCents: number;
}

export interface ReferralAggregationItem {
  source: string;
  count: number;
}

export interface PullQuote {
  patientName: string;
  questionLabel: string;
  text: string;
  submittedAt: string;
}

/** Narrow, safe shape returned to the anonymous public survey page. */
export interface PublicSurveyView {
  status: "ok" | "not_found" | "closed" | "already_responded";
  patientFirstName?: string;
  campaignTitle?: string;
  questions?: SurveyQuestion[];
  creditAmountCents?: number;
}

export interface OtherStatForEntry {
  stat: Stat;
  post: Post;
  employee: Profile;
  previousValue: number | null;
  previousWeekStart: string | null;
  existingEntry: StatEntry | null;
}
