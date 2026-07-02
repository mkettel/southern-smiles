import { format, startOfWeek } from "date-fns";
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
  subject: string;
}

export interface CherryApprovalImportPayload {
  messageId?: string | null;
  subject: string;
  body: string;
  receivedAt: string;
}

const APPROVAL_SUBJECT_PATTERNS = [
  /approved\s+for\s+purchases\s+up\s+to\s+\$[\d,]+(?:\.\d{2})?\s+at\s+southern\s+smiles/i,
  /has\s+been\s+approved\s+for\s+\$[\d,]+(?:\.\d{2})?\s+at\s+southern\s+smiles/i,
  /is\s+approved\s+for\s+purchases\s+up\s+to\s+\$[\d,]+(?:\.\d{2})?\s+at\s+southern\s+smiles/i,
];

const TOTAL_AVAILABLE_PATTERN =
  /total\s+available\s*(?:\r?\n|:|\s)+(\$[\d,]+(?:\.\d{2})?)/i;

const SUBJECT_AMOUNT_PATTERNS = [
  /approved\s+for\s+purchases\s+up\s+to\s+(\$[\d,]+(?:\.\d{2})?)/i,
  /has\s+been\s+approved\s+for\s+(\$[\d,]+(?:\.\d{2})?)/i,
  /is\s+approved\s+for\s+purchases\s+up\s+to\s+(\$[\d,]+(?:\.\d{2})?)/i,
];

export function parseCherryDollarAmountToCents(value: string): number | null {
  const normalized = value.replace(/[$,\s]/g, "");
  if (!normalized) return null;

  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return null;

  return Math.round(amount * 100);
}

export function getCherryApprovalWeekStart(approvedAt: string): string | null {
  const date = new Date(approvedAt);
  if (Number.isNaN(date.getTime())) return null;
  return format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
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
    subject: subject.slice(0, 300),
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
