import { z } from "zod";

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
      !Number.isNaN(parsed.valueOf()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Enter a valid date");
const sourceUrl = z.union([
  z.literal(""),
  z.url().refine((value) => {
    const url = new URL(value);
    return (
      ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  }, "Use an HTTP or HTTPS source link"),
]);

export const actionDraftSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().trim().min(1).max(160),
  entry_text: z.string().trim().min(1).max(5000),
  effective_date: z.union([z.literal(""), date]),
  date_confirmed: z.boolean(),
  implementation: z.enum(["implemented", "unconfirmed", "planned"]),
  area: z.string().trim().max(200),
  post_affected: z.string().trim().max(200),
  stats: z.array(z.string().trim().min(1).max(150)).max(20),
  source_label: z.string().trim().min(1).max(200),
  source_url: sourceUrl,
  source_key: z.string().min(1).max(300),
  evidence: z.string().max(3000),
});
export type ActionDraft = z.infer<typeof actionDraftSchema>;
export const suggestionSchema = actionDraftSchema.extend({
  status: z.enum(["pending", "accepted", "dismissed"]),
  reviewed_at: z.string().datetime().nullable(),
});
export type ActionSuggestion = z.infer<typeof suggestionSchema>;
export const suggestionStateSchema = z
  .object({
    version: z.literal(1),
    items: z.array(suggestionSchema).max(1000),
  })
  .refine(
    ({ items }) => new Set(items.map((item) => item.id)).size === items.length,
    "Duplicate IDs",
  );
export type SuggestionState = z.infer<typeof suggestionStateSchema>;

export function practiceToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normalized(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function sameAction(a: ActionDraft, b: ActionDraft) {
  return (
    a.source_key === b.source_key ||
    (a.effective_date === b.effective_date &&
      normalized(a.entry_text) === normalized(b.entry_text))
  );
}

export function approvalBlocker(
  item: ActionSuggestion,
  items: ActionSuggestion[],
  today: string,
): string | null {
  if (item.status !== "pending") return "Already reviewed";
  if (item.implementation !== "implemented") return "Confirm implementation";
  if (!item.date_confirmed || !item.effective_date) return "Confirm date";
  if (item.effective_date > today) return "Future date";
  if (
    items.some(
      (other) =>
        other.id !== item.id &&
        other.status === "accepted" &&
        sameAction(item, other),
    )
  )
    return "Already on timeline";
  return null;
}

export function reviewSuggestions(
  state: SuggestionState,
  ids: string[],
  status: "accepted" | "dismissed" | "pending",
  now: string,
  today: string,
) {
  let items = [...state.items];
  for (const id of new Set(ids)) {
    const item = items.find((entry) => entry.id === id);
    if (!item || item.status === status) continue;
    if (status === "accepted" && approvalBlocker(item, items, today)) continue;
    items = items.map((entry) =>
      entry.id === id
        ? { ...entry, status, reviewed_at: status === "pending" ? null : now }
        : entry,
    );
  }
  return { ...state, items };
}

export function importSuggestions(state: SuggestionState, input: unknown) {
  const drafts = z.array(actionDraftSchema).min(1).max(200).parse(input);
  const items = [...state.items];
  let added = 0;
  for (const draft of drafts) {
    if (items.some((item) => item.id === draft.id || sameAction(item, draft)))
      continue;
    // Imported files can propose facts, but cannot approve themselves.
    items.push({
      ...draft,
      implementation: "unconfirmed",
      date_confirmed: false,
      status: "pending",
      reviewed_at: null,
    });
    added++;
  }
  return { state: suggestionStateSchema.parse({ ...state, items }), added };
}

export function toOicEntry(item: ActionDraft) {
  return {
    effective_date: item.effective_date,
    area: item.area || null,
    post_affected: item.post_affected || null,
    entry_text: [
      item.title,
      item.entry_text,
      item.stats.length ? `Stats to watch: ${item.stats.join(", ")}` : "",
      `Source: ${item.source_label}${item.source_url ? ` (${item.source_url})` : ""}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}

export const initialSuggestions: SuggestionState = {
  version: 1,
  items: [
    {
      id: "board-pr-51",
      source_key: "github:mkettel/southern-smiles:pr:51",
      title: "Introduce shared Survival Game challenges",
      entry_text:
        "Introduce individual, team, and office challenges on the Board, with trusted progress updates and a shared history. Staff can record progress without waiting for manager approval.",
      effective_date: "2026-09-05",
      date_confirmed: false,
      implementation: "unconfirmed",
      area: "Practice operations",
      post_affected: "All staff",
      stats: ["Challenge participation", "Implants placed", "Patient reviews"],
      source_label: "Survival Board / PR #51",
      source_url: "https://github.com/mkettel/southern-smiles/pull/51",
      evidence:
        "Merged September 5, 2026. Confirm when staff began using it. Suggested stats are not proof of impact.",
      status: "pending",
      reviewed_at: null,
    },
    {
      id: "board-pr-50",
      source_key: "github:mkettel/southern-smiles:pr:50",
      title: "Introduce learned bookkeeping approvals",
      entry_text:
        "Introduce automatic approval for eligible recurring transaction patterns after three matching approvals. Loans and transfers remain excluded from that automation.",
      effective_date: "2026-09-02",
      date_confirmed: false,
      implementation: "unconfirmed",
      area: "Finance",
      post_affected: "Bookkeeping",
      stats: [
        "Transactions awaiting review",
        "Bookkeeping time",
        "Corrections after posting",
      ],
      source_label: "Survival Board / PR #50",
      source_url: "https://github.com/mkettel/southern-smiles/pull/50",
      evidence:
        "Merged September 2, 2026. Confirm the actual start date; this source does not establish how many transactions were automatically posted.",
      status: "pending",
      reviewed_at: null,
    },
  ],
};
