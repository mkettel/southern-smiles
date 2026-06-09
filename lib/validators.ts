import { z } from "zod";

// Relaxed UUID pattern — accepts any UUID-shaped string without enforcing
// RFC 4122 version/variant bits (our seed data uses hand-crafted UUIDs).
const uuidLike = z.string().regex(
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  "Invalid UUID"
);

export const statEntrySchema = z.object({
  stat_id: uuidLike,
  value: z.number().finite(),
  self_condition: z
    .enum(["power", "affluence", "normal", "emergency", "danger", "non_existence"])
    .nullable()
    .optional(),
  playbook_response: z.string().max(2000).nullable().optional(),
});

export const submitWeeklyStatsSchema = z.object({
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  profile_id: uuidLike.optional(),
  entries: z.array(statEntrySchema).min(1),
});

export const dollarValueSchema = z.number().min(0, "Must be a positive amount");
export const percentageValueSchema = z
  .number()
  .min(0, "Must be 0 or greater")
  .max(100, "Must be 100 or less");
export const countValueSchema = z
  .number()
  .int("Must be a whole number")
  .min(0, "Must be 0 or greater");

export function getValidatorForStatType(statType: "dollar" | "percentage" | "count") {
  switch (statType) {
    case "dollar":
      return dollarValueSchema;
    case "percentage":
      return percentageValueSchema;
    case "count":
      return countValueSchema;
  }
}

export const divisionSchema = z.object({
  number: z.number().int().min(1),
  name: z.string().min(1).max(100),
  executive: z.string().max(100).nullable().optional(),
  vfp: z.string().max(500).nullable().optional(),
  color: z.string().max(20).optional(),
});

export const departmentSchema = z.object({
  name: z.string().min(1).max(100),
  director: z.string().max(100).nullable().optional(),
  division_id: uuidLike,
  display_order: z.number().int().min(0).default(0),
});

export const sectionSchema = z.object({
  name: z.string().min(1).max(100),
  assignee: z.string().max(100).nullable().optional(),
  department_id: uuidLike,
  post_id: uuidLike.nullable().optional(),
  responsibilities: z.array(z.string().max(200)).max(20).default([]),
  display_order: z.number().int().min(0).default(0),
});

export const postSchema = z.object({
  title: z.string().min(1).max(100),
  vfp: z.string().max(500).nullable().optional(),
  division_id: uuidLike,
});

export const statDefinitionSchema = z.object({
  name: z.string().min(1).max(100),
  abbreviation: z.string().max(10).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  stat_type: z.enum(["dollar", "percentage", "count"]),
  good_direction: z.enum(["up", "down"]),
  post_id: uuidLike,
  display_order: z.number().int().min(0).default(0),
});

export const oicLogSchema = z.object({
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  area: z.string().max(100).nullable().optional(),
  post_affected: z.string().max(100).nullable().optional(),
  entry_text: z.string().min(1).max(2000),
});

export const changelogEntrySchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  body: z.unknown(),
  image_url: z.string().url().nullable().optional(),
  video_url: z.string().url().nullable().optional(),
  tags: z.array(z.string().max(40)).max(8).default([]),
  visibility: z.enum(["admin", "everyone"]).default("admin"),
});

export const messageSchema = z.object({
  content: z.string().min(1, "Message cannot be empty").max(4000),
  mentions: z.array(uuidLike).default([]),
});

export const channelSchema = z.object({
  name: z.string().min(1, "Channel name is required").max(50),
});

export const taskSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(4000).nullable().optional(),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")
    .nullable()
    .optional(),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  requires_approval: z.boolean().default(false),
  assignee_ids: z.array(uuidLike).min(1, "Pick at least one assignee").max(20),
});

export const taskCommentSchema = z.object({
  message: z.string().min(1, "Message cannot be empty").max(4000),
});

// ============================================================
// Patient surveys & referral insights
// ============================================================

export const surveyQuestionSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(["rating", "single_choice", "multi_choice", "text", "referral_source"]),
  label: z.string().min(1, "Question label is required").max(300),
  options: z.array(z.string().min(1).max(200)).max(30).optional(),
  required: z.boolean().optional(),
});

export const surveyCampaignSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  questions: z.array(surveyQuestionSchema).min(1, "Add at least one question").max(30),
  credit_amount_cents: z.number().int().min(0).max(1_000_000).default(5000),
  credit_expires_days: z.number().int().min(1).max(3650).nullable().optional(),
});

export const patientImportRowSchema = z.object({
  full_name: z.string().min(1, "Name is required").max(200),
  first_name: z.string().max(100).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  email: z.string().max(200).nullable().optional(),
  external_ref: z.string().max(100).nullable().optional(),
});

export const surveySubmissionSchema = z.object({
  code: z.string().min(4).max(40),
  answers: z.record(z.string().max(64), z.unknown()),
});

export const redeemCreditSchema = z.object({
  recipient_id: uuidLike,
});

export const aggregatedPatientSchema = z.object({
  full_name: z.string().min(1).max(200),
  first_name: z.string().max(100).nullable().optional(),
  name_key: z.string().min(1).max(220),
  email: z.string().max(200).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  external_ref: z.string().max(100).nullable().optional(),
  total_collected_cents: z.number().int().min(0).max(1_000_000_000),
  visit_count: z.number().int().min(0).max(100_000),
  first_seen: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  last_seen: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  attributes: z.record(z.string().max(64), z.unknown()).default({}),
});

export const importPatientDataSchema = z.object({
  records: z.array(aggregatedPatientSchema).min(1).max(10000),
});

export const patientFiltersSchema = z.object({
  search: z.string().max(100).optional(),
  minValueCents: z.number().int().min(0).optional(),
  lapsedMonths: z.number().int().min(0).max(120).optional(),
  newWithinMonths: z.number().int().min(0).max(120).optional(),
  repeatOnly: z.boolean().optional(),
});
