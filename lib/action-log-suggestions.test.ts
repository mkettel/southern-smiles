import { test } from "node:test";
import assert from "node:assert/strict";
import {
  actionDraftSchema,
  approvalBlocker,
  importSuggestions,
  initialSuggestions,
  reviewSuggestions,
  suggestionStateSchema,
  toOicEntry,
  type ActionSuggestion,
} from "./action-log-suggestions";

const now = "2026-09-13T12:00:00.000Z";
const today = "2026-09-13";
const ready: ActionSuggestion = {
  ...initialSuggestions.items[0],
  implementation: "implemented",
  date_confirmed: true,
};

test("backfill candidates require implementation and effective-date confirmation", () => {
  assert.equal(
    approvalBlocker(initialSuggestions.items[0], [], today),
    "Confirm implementation",
  );
  assert.equal(
    approvalBlocker({ ...ready, date_confirmed: false }, [], today),
    "Confirm date",
  );
  assert.equal(
    approvalBlocker({ ...ready, effective_date: "" }, [], today),
    "Confirm date",
  );
  assert.equal(
    approvalBlocker({ ...ready, implementation: "planned" }, [], today),
    "Confirm implementation",
  );
  assert.equal(
    approvalBlocker({ ...ready, effective_date: "2026-10-01" }, [], today),
    "Future date",
  );
  assert.equal(approvalBlocker(ready, [], today), null);
});

test("bulk acceptance skips unconfirmed entries and repeated clicks are idempotent", () => {
  const state = {
    version: 1 as const,
    items: [ready, initialSuggestions.items[1]],
  };
  const reviewed = reviewSuggestions(
    state,
    state.items.map((item) => item.id),
    "accepted",
    now,
    today,
  );
  assert.deepEqual(
    reviewed.items.map((item) => item.status),
    ["accepted", "pending"],
  );
  assert.deepEqual(
    reviewSuggestions(reviewed, [ready.id], "accepted", now, today),
    reviewed,
  );
  assert.equal(state.items[0].status, "pending");
});

test("same source or same dated text cannot be added twice, even in one batch", () => {
  for (const duplicate of [
    { ...ready, id: "duplicate" },
    {
      ...ready,
      id: "duplicate",
      source_key: "other",
      entry_text: ready.entry_text.toUpperCase(),
    },
  ]) {
    const reviewed = reviewSuggestions(
      { version: 1, items: [ready, duplicate] },
      [ready.id, duplicate.id],
      "accepted",
      now,
      today,
    );
    assert.deepEqual(
      reviewed.items.map((item) => item.status),
      ["accepted", "pending"],
    );
  }
});

test("dismiss/restore/undo preserve the draft and prevent direct acceptance of dismissed entries", () => {
  const state = { version: 1 as const, items: [ready] };
  const dismissed = reviewSuggestions(
    state,
    [ready.id],
    "dismissed",
    now,
    today,
  );
  assert.equal(
    reviewSuggestions(dismissed, [ready.id], "accepted", now, today).items[0]
      .status,
    "dismissed",
  );
  assert.deepEqual(
    reviewSuggestions(dismissed, [ready.id], "pending", now, today),
    state,
  );
  const accepted = reviewSuggestions(state, [ready.id], "accepted", now, today);
  assert.deepEqual(
    reviewSuggestions(accepted, [ready.id], "pending", now, today),
    state,
  );
});

test("imports cannot self-approve, and repeat imports do not resurrect dismissed suggestions", () => {
  const result = importSuggestions({ version: 1, items: [] }, [
    { ...ready, status: "accepted" },
  ]);
  assert.equal(result.added, 1);
  assert.equal(result.state.items[0].status, "pending");
  assert.equal(result.state.items[0].date_confirmed, false);
  assert.equal(result.state.items[0].implementation, "unconfirmed");
  const dismissed = reviewSuggestions(
    result.state,
    [ready.id],
    "dismissed",
    now,
    today,
  );
  assert.equal(importSuggestions(dismissed, [ready]).added, 0);
});

test("invalid dates, unsafe links, empty descriptions and duplicate stored IDs are rejected", () => {
  for (const value of [
    { effective_date: "2026-02-30" },
    { source_url: "javascript:alert(1)" },
    { source_url: "https://user:secret@example.com" },
    { entry_text: " " },
  ]) {
    assert.equal(
      actionDraftSchema.safeParse({ ...ready, ...value }).success,
      false,
    );
    assert.throws(() =>
      importSuggestions(initialSuggestions, [{ ...ready, ...value }]),
    );
  }
  assert.equal(
    suggestionStateSchema.safeParse({ version: 1, items: [ready, ready] })
      .success,
    false,
  );
});

test("export retains the existing OIC entry contract with source and stat context", () => {
  const entry = toOicEntry(ready);
  assert.equal(entry.effective_date, ready.effective_date);
  assert.equal(entry.area, ready.area);
  assert.match(entry.entry_text, /Stats to watch:/);
  assert.ok(entry.entry_text.includes(ready.source_url));
  assert.deepEqual(Object.keys(entry), [
    "effective_date",
    "area",
    "post_affected",
    "entry_text",
  ]);
});
