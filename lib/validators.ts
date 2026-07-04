import { z } from "zod";
import { BILL_CATEGORIES } from "@/lib/bills";

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

export const billVendorSchema = z.object({
  name: z.string().trim().min(1, "Vendor name is required").max(160),
  default_category: z.enum(BILL_CATEGORIES).default("Miscellaneous"),
  notes: z.string().max(2000).nullable().optional(),
});

export const billSchema = z
  .object({
    vendor_id: uuidLike,
    category: z.enum(BILL_CATEGORIES),
    invoice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
    amount_cents: z.number().int().min(0, "Amount must be 0 or greater"),
    notes: z.string().max(4000).nullable().optional(),
    status: z.enum(["unpaid", "paid"]).default("unpaid"),
    paid_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")
      .nullable()
      .optional(),
  })
  .refine((value) => value.status === "unpaid" || Boolean(value.paid_date), {
    message: "Paid date is required when a bill is paid",
    path: ["paid_date"],
  });

export const overheadCategorySchema = z.object({
  name: z.string().trim().min(1, "Category name is required").max(160),
  description: z.string().max(500).nullable().optional(),
  display_order: z.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
});

export const overheadItemSchema = z.object({
  category_id: uuidLike,
  name: z.string().trim().min(1, "Line item name is required").max(200),
  monthly_cost_cents: z.number().int().min(0, "Amount must be 0 or greater"),
  notes: z.string().max(2000).nullable().optional(),
  display_order: z.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
});

export const overheadSettingsSchema = z.object({
  operatories_count: z.number().int().min(1).max(100),
  days_per_week: z.number().min(0.5).max(7),
  clinical_hours_per_day: z.number().min(0.5).max(24),
  weeks_per_month: z.number().min(1).max(6),
  utilization_percent: z.number().min(1).max(100),
  notes: z.string().max(4000).nullable().optional(),
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

export const surveySubmissionSchema = z.object({
  code: z.string().min(4).max(40),
  answers: z.record(z.string().max(64), z.unknown()),
});

export const redeemCreditSchema = z.object({
  recipient_id: uuidLike,
});

// De-identified import payload. NOTE: there are intentionally NO name/phone/
// email fields here — this is the server boundary, so even a malicious client
// cannot smuggle PHI through the import action. Identity is hashed to
// bridge_key in the browser before it reaches the wire.
export const deidentifiedPatientSchema = z.object({
  bridge_key: z.string().min(1).max(200),
  external_ref: z.string().max(100).nullable().optional(),
  total_collected_cents: z.number().int().min(0).max(1_000_000_000),
  visit_count: z.number().int().min(0).max(100_000),
  first_seen: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  last_seen: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export const importDeidentifiedPatientsSchema = z.object({
  records: z.array(deidentifiedPatientSchema).min(1).max(10000),
});

export const flyerConfigSchema = z.object({
  heading: z.string().max(120).default(""),
  body: z.string().max(1500).default(""),
  signature: z.string().max(200).default(""),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #0f766e")
    .default("#0f766e"),
  backgroundMode: z.enum(["solid", "image"]).default("solid"),
  backgroundUrl: z.string().url().nullable().optional(),
  includeQuestions: z.boolean().default(false),
});

export const campaignQuestionsSchema = z
  .array(surveyQuestionSchema)
  .min(1, "Add at least one question")
  .max(30);

// ============================================================
// Flyer document (v2 block model — see lib/flyer/types.ts)
// ============================================================

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #0f766e");
const hexOrTransparent = z.union([hexColor, z.literal("transparent")]);
const flyerFontKey = z.enum(["inter", "poppins", "nunito", "playfair", "lora", "caveat"]);

const flyerBlockBase = {
  id: z.string().min(1).max(40),
  x: z.number().finite(),
  y: z.number().finite(),
  w: z.number().finite().min(1),
  h: z.number().finite().min(1),
  rotation: z.number().finite().min(-360).max(360).default(0),
  z: z.number().finite().min(0).max(500).default(1),
};

export const flyerBlockSchema = z.discriminatedUnion("type", [
  z.object({
    ...flyerBlockBase,
    type: z.literal("text"),
    text: z.string().max(3000),
    role: z.enum(["heading", "body", "signature"]).optional(),
    font: flyerFontKey.default("inter"),
    fontSize: z.number().min(6).max(120),
    bold: z.boolean().default(false),
    color: hexColor,
    align: z.enum(["left", "center", "right"]).default("left"),
    lineHeight: z.number().min(0.8).max(3).default(1.4),
    backgroundColor: hexOrTransparent.default("transparent"),
    padding: z.number().min(0).max(72).default(0),
    borderRadius: z.number().min(0).max(200).default(0),
  }),
  z.object({
    ...flyerBlockBase,
    type: z.literal("image"),
    url: z.string().url().nullable(),
    aiPrompt: z.string().max(500).optional(),
    fit: z.enum(["cover", "contain"]).default("cover"),
    borderRadius: z.number().min(0).max(400).default(0),
    opacity: z.number().min(0.05).max(1).default(1),
    naturalWidth: z.number().int().positive().optional(),
    naturalHeight: z.number().int().positive().optional(),
  }),
  z.object({
    ...flyerBlockBase,
    type: z.literal("shape"),
    shape: z.enum(["rect", "line", "circle", "blob1", "blob2", "wave", "tooth", "sparkle", "heart"]),
    color: hexColor,
    opacity: z.number().min(0.05).max(1).default(1),
    borderRadius: z.number().min(0).max(400).default(0),
  }),
  z.object({
    ...flyerBlockBase,
    type: z.literal("qr"),
    frameColor: hexColor,
    caption: z.string().max(80).default(""),
  }),
  z.object({
    ...flyerBlockBase,
    type: z.literal("credit"),
    caption: z.string().max(120),
    label: z.string().max(120),
    backgroundColor: hexColor,
    textColor: hexColor,
    borderRadius: z.number().min(0).max(200).default(8),
    font: flyerFontKey.default("inter"),
  }),
]);

export const flyerBackgroundSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("solid"), color: hexColor }),
  z.object({
    type: z.literal("gradient"),
    from: hexColor,
    to: hexColor,
    angle: z.number().min(0).max(360).default(160),
  }),
  z.object({
    type: z.literal("image"),
    url: z.string().url().nullable(),
    aiPrompt: z.string().max(500).optional(),
    overlayColor: hexColor.default("#ffffff"),
    overlayOpacity: z.number().min(0).max(0.95).default(0),
  }),
]);

export const flyerDocumentSchema = z.object({
  version: z.literal(2),
  page: z.object({ background: flyerBackgroundSchema }),
  blocks: z.array(flyerBlockSchema).min(1).max(40),
  savedAt: z.string().max(40).optional(),
});

export const generateAiFlyerSchema = z.object({
  campaign_id: uuidLike,
  brief: z.string().min(3, "Describe the flyer you want").max(5000),
  tone: z.enum(["warm", "playful", "professional"]).default("warm"),
});

export const generateAiImageSchema = z.object({
  campaign_id: uuidLike,
  prompt: z.string().min(3, "Describe the look you want").max(500),
  kind: z.enum(["background", "illustration"]).default("illustration"),
  aspect: z.enum(["portrait", "landscape", "square"]).default("square"),
});

export const patientFiltersSchema = z.object({
  search: z.string().max(100).optional(),
  minValueCents: z.number().int().min(0).optional(),
  lapsedMonths: z.number().int().min(0).max(120).optional(),
  newWithinMonths: z.number().int().min(0).max(120).optional(),
  repeatOnly: z.boolean().optional(),
});
