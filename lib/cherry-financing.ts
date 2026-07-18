import type { Stat } from "@/lib/types";

export const CHERRY_APPROVED_FINANCING_DIVISION = 2;
export const CHERRY_APPROVED_FINANCING_STAT_NAME = "approved financing";

export interface CherryApprovalEmailInput {
  messageId: string;
  subject: string;
  body: string;
  receivedAt: string;
}

export interface CherryApprovalEmailResult {
  source: "cherry_email";
  sourceMessageId: string;
  approvedAt: string;
  weekStart: string;
  amountCents: number;
}

export interface CherryApprovalImportPayload {
  messageId?: string | null;
  subject: string;
  body: string;
  receivedAt: string;
}

const REPORTING_TIME_ZONE = "America/Phoenix";

function extractEmailAddress(value: string) {
  const angleBracketMatch = value.match(/<([^<>]+)>/);
  return (angleBracketMatch?.[1] ?? value).trim().toLowerCase();
}

export function isExpectedCherrySender(
  sender: string,
  expectedSender = "support@withcherry.com",
) {
  return extractEmailAddress(sender) === expectedSender.trim().toLowerCase();
}

export function isExpectedCherryRecipient(
  recipients: string[],
  expectedRecipient: string,
) {
  const expected = expectedRecipient.trim().toLowerCase();
  return recipients.some(
    (recipient) => extractEmailAddress(recipient) === expected,
  );
}

export function getCherryEmailBody(
  textBody: string | null,
  htmlBody: string | null,
) {
  if (textBody?.trim()) return textBody;
  if (!htmlBody) return "";

  return htmlBody
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#36;|&dollar;/gi, "$")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatUtcDate(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * Returns the dashboard's Monday week_start for a Cherry approval.
 * Friday at 4 PM Phoenix time starts the following reporting week.
 */
export function getCherryBusinessWeekStart(receivedAt: string | Date): string {
  const instant = receivedAt instanceof Date ? receivedAt : new Date(receivedAt);
  if (Number.isNaN(instant.getTime())) {
    throw new RangeError("Invalid Cherry approval timestamp");
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: REPORTING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  const localDate = new Date(
    Date.UTC(value("year"), value("month") - 1, value("day")),
  );
  const weekday = localDate.getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  const monday = new Date(localDate);
  monday.setUTCDate(localDate.getUTCDate() - daysSinceMonday);

  const afterWeeklyCutoff =
    weekday === 6 ||
    weekday === 0 ||
    (weekday === 5 && value("hour") >= 16);
  if (afterWeeklyCutoff) {
    monday.setUTCDate(monday.getUTCDate() + 7);
  }

  return formatUtcDate(monday);
}

const CHERRY_AMOUNT_PATTERN = String.raw`\$[\d,]+(?:\.\d{2})?(?:\s+USD)?`;

const APPROVAL_SUBJECT_PATTERNS = [
  new RegExp(
    String.raw`approved\s+for\s+purchases\s+up\s+to\s+${CHERRY_AMOUNT_PATTERN}\s+at\s+southern\s+smiles`,
    "i",
  ),
  new RegExp(
    String.raw`has\s+been\s+approved\s+for\s+${CHERRY_AMOUNT_PATTERN}\s+at\s+southern\s+smiles`,
    "i",
  ),
  new RegExp(
    String.raw`is\s+approved\s+for\s+purchases\s+up\s+to\s+${CHERRY_AMOUNT_PATTERN}\s+at\s+southern\s+smiles`,
    "i",
  ),
];

// Anchor to the start of a line (multiline) so an upsell block that merely
// contains the words "total available" mid-sentence can't be matched ahead of
// the real, labeled "Total Available" line in the Cherry template.
const TOTAL_AVAILABLE_PATTERN = new RegExp(
  String.raw`^\s*total\s+available\s*(?:\r?\n|:|\s)+(${CHERRY_AMOUNT_PATTERN})`,
  "im",
);

const SUBJECT_AMOUNT_PATTERNS = [
  new RegExp(
    String.raw`approved\s+for\s+purchases\s+up\s+to\s+(${CHERRY_AMOUNT_PATTERN})`,
    "i",
  ),
  new RegExp(
    String.raw`has\s+been\s+approved\s+for\s+(${CHERRY_AMOUNT_PATTERN})`,
    "i",
  ),
  new RegExp(
    String.raw`is\s+approved\s+for\s+purchases\s+up\s+to\s+(${CHERRY_AMOUNT_PATTERN})`,
    "i",
  ),
];

export function parseCherryDollarAmountToCents(value: string): number | null {
  const normalized = value.replace(/usd/gi, "").replace(/[$,\s]/g, "");
  if (!normalized) return null;

  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return null;

  return Math.round(amount * 100);
}

export function getCherryApprovalWeekStart(approvedAt: string): string | null {
  try {
    return getCherryBusinessWeekStart(approvedAt);
  } catch {
    return null;
  }
}

export function parseCherryApprovalEmail(
  input: CherryApprovalEmailInput,
): CherryApprovalEmailResult | null {
  const subject = input.subject.trim();
  const body = input.body.trim();
  const approvedAt = input.receivedAt.trim();
  const weekStart = getCherryApprovalWeekStart(approvedAt);

  if (!input.messageId.trim() || !subject || !body || !weekStart) return null;

  const looksLikeApproval = APPROVAL_SUBJECT_PATTERNS.some((pattern) =>
    pattern.test(subject),
  );

  if (!looksLikeApproval) return null;

  const bodyMatch = body.match(TOTAL_AVAILABLE_PATTERN);
  const subjectMatch = SUBJECT_AMOUNT_PATTERNS.map((pattern) =>
    subject.match(pattern),
  ).find(Boolean);

  const rawAmount = bodyMatch?.[1] ?? subjectMatch?.[1];
  if (!rawAmount) return null;

  const amountCents = parseCherryDollarAmountToCents(rawAmount);
  if (amountCents === null) return null;

  return {
    source: "cherry_email",
    sourceMessageId: input.messageId.trim(),
    approvedAt,
    weekStart,
    amountCents,
  };
}

export function isCherryApprovedFinancingStat(
  stat: Pick<Stat, "name" | "stat_type"> & {
    post?: { division?: { number?: number | null } | null } | null;
  },
) {
  return (
    stat.stat_type === "dollar" &&
    stat.name.trim().toLowerCase() === CHERRY_APPROVED_FINANCING_STAT_NAME &&
    stat.post?.division?.number === CHERRY_APPROVED_FINANCING_DIVISION
  );
}
