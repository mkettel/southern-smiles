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
    .enum(["affluence", "normal", "emergency", "danger", "non_existence"])
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
});

export const postSchema = z.object({
  title: z.string().min(1).max(100),
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

export const messageSchema = z.object({
  content: z.string().min(1, "Message cannot be empty").max(4000),
  mentions: z.array(uuidLike).default([]),
});

export const channelSchema = z.object({
  name: z.string().min(1, "Channel name is required").max(50),
});
