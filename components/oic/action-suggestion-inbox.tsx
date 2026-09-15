"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ExternalLink,
  Inbox,
  Pencil,
  Plus,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DraftEditor } from "@/components/oic/action-log-preview";
import { changeActionSuggestions } from "@/actions/action-suggestions";
import {
  approvalBlocker,
  practiceToday,
  type ActionDraft,
} from "@/lib/action-log-suggestions";
import type { SharedActionSuggestion } from "@/lib/shared-action-suggestions";

export function ActionSuggestionInbox({
  items,
  error,
}: {
  items: SharedActionSuggestion[];
  error?: string;
}) {
  const [filter, setFilter] = useState("pending");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<{
    draft: ActionDraft;
    version?: number;
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const today = practiceToday();
  const flattened = items.map((item) => ({
    ...item.draft,
    status: item.status,
    reviewed_at: item.reviewed_at,
  }));
  const visible = items.filter(
    (item) =>
      item.status === filter &&
      `${item.draft.title} ${item.draft.entry_text}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const ready = visible.filter(
    (item) =>
      !approvalBlocker(
        { ...item.draft, status: item.status, reviewed_at: item.reviewed_at },
        flattened,
        today,
      ),
  );

  function mutate(input: unknown, message: string) {
    startTransition(async () => {
      try {
        const result = await changeActionSuggestions(input);
        if (result.error) {
          toast.error(result.error);
          router.refresh();
          return;
        }
        toast.success(`${result.changed} ${message}`);
        setEditing(null);
        setSelected([]);
        router.refresh();
      } catch {
        toast.error(
          "Connection interrupted. Refresh to check the result before retrying.",
        );
      }
    });
  }
  function review(
    operation: "accept" | "dismiss" | "restore",
    rows: SharedActionSuggestion[],
  ) {
    mutate(
      { operation, items: rows.map(({ id, version }) => ({ id, version })) },
      operation === "accept"
        ? "added to Action Log"
        : operation === "dismiss"
          ? "dismissed"
          : "restored",
    );
  }
  function newNote() {
    const id = crypto.randomUUID();
    setEditing({
      draft: {
        id,
        source_key: `office-note:${id}`,
        title: "",
        entry_text: "",
        effective_date: today,
        date_confirmed: false,
        implementation: "unconfirmed",
        area: "",
        post_affected: "",
        stats: [],
        source_label: "Office note",
        source_url: "",
        evidence: "",
      },
    });
  }

  return (
    <section className="space-y-4 border-y py-5" aria-label="Suggested actions">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Inbox className="size-4" />
          Suggested actions{" "}
          <span className="text-muted-foreground">
            {items.filter((item) => item.status === "pending").length}
          </span>
        </h2>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !!error}
            onClick={() => fileInput.current?.click()}
          >
            <Upload className="size-4" />
            Import project updates
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !!error}
            onClick={newNote}
          >
            <Plus className="size-4" />
            Draft note
          </Button>
        </div>
        <input
          className="hidden"
          type="file"
          ref={fileInput}
          accept=".json,application/json"
          aria-label="Project updates file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            if (file.size > 1_000_000) {
              toast.error("Choose a JSON file smaller than 1 MB.");
              return;
            }
            startTransition(async () => {
              try {
                const result = await changeActionSuggestions({
                  operation: "import",
                  items: JSON.parse(await file.text()),
                });
                if (result.error) toast.error(result.error);
                else {
                  toast.success(
                    `${result.changed} suggestions imported; duplicates skipped`,
                  );
                  router.refresh();
                }
              } catch {
                toast.error(
                  "Could not import this file. Check the JSON format and connection.",
                );
              }
            });
          }}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              aria-label="Suggestion status"
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value);
                setSelected([]);
              }}
            >
              <option value="pending">Needs review</option>
              <option value="accepted">Added to log</option>
              <option value="dismissed">Dismissed</option>
            </select>
            <Input
              className="w-full sm:w-64"
              aria-label="Search suggestions"
              placeholder="Search suggestions"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelected([]);
              }}
            />
          </div>
          {filter === "pending" && ready.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  disabled={pending}
                  checked={ready.every((item) => selected.includes(item.id))}
                  onChange={(event) =>
                    setSelected(
                      event.target.checked ? ready.map((item) => item.id) : [],
                    )
                  }
                />
                Select ready actions
              </label>
              <Button
                size="sm"
                disabled={
                  pending || !ready.some((item) => selected.includes(item.id))
                }
                onClick={() =>
                  review(
                    "accept",
                    ready.filter((item) => selected.includes(item.id)),
                  )
                }
              >
                <Check className="size-4" />
                Add selected
              </Button>
            </div>
          )}
          {visible.map((item) => {
            const blocker = approvalBlocker(
              {
                ...item.draft,
                status: item.status,
                reviewed_at: item.reviewed_at,
              },
              flattened,
              today,
            );
            return (
              <article
                key={item.id}
                className="space-y-3 rounded-lg border bg-card p-4"
              >
                <div className="flex items-start gap-3">
                  {filter === "pending" && (
                    <input
                      type="checkbox"
                      className="mt-1.5 size-4"
                      disabled={pending || !!blocker}
                      checked={selected.includes(item.id)}
                      aria-label={`Select ${item.draft.title}`}
                      onChange={(event) =>
                        setSelected(
                          event.target.checked
                            ? [...selected, item.id]
                            : selected.filter((id) => id !== item.id),
                        )
                      }
                    />
                  )}
                  <h3 className="min-w-0 break-words font-semibold">
                    {item.draft.title}
                  </h3>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm leading-6">
                  {item.draft.entry_text}
                </p>
                <p className="break-words text-xs text-muted-foreground">
                  {item.draft.effective_date || "Date needed"} ·{" "}
                  {item.draft.area || "General"} ·{" "}
                  {filter === "pending"
                    ? blocker || "Ready to add"
                    : item.status === "accepted"
                      ? "Added to Action Log"
                      : "Dismissed"}
                </p>
                {!!item.draft.stats.length && (
                  <p className="text-xs text-sky-700 dark:text-sky-400">
                    Stats to watch: {item.draft.stats.join(", ")}
                  </p>
                )}
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">
                    Source and original evidence
                  </summary>
                  <div className="mt-2 space-y-2 break-words">
                    <p>{item.original_draft.source_label}</p>
                    <p>{item.original_draft.evidence || "Office note"}</p>
                    {item.original_draft.source_url && (
                      <a
                        href={item.original_draft.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 underline"
                      >
                        Open source
                        <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                </details>
                {filter !== "accepted" && (
                  <div className="flex flex-wrap justify-end gap-2">
                    {filter === "pending" ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => review("dismiss", [item])}
                        >
                          <X className="size-4" />
                          Dismiss
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() =>
                            setEditing({
                              draft: item.draft,
                              version: item.version,
                            })
                          }
                        >
                          <Pencil className="size-4" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          disabled={pending || !!blocker}
                          onClick={() => review("accept", [item])}
                        >
                          <Check className="size-4" />
                          Add to log
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => review("restore", [item])}
                      >
                        <RotateCcw className="size-4" />
                        Restore
                      </Button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
          {!visible.length && (
            <p className="py-4 text-sm text-muted-foreground">
              {query
                ? "No matching suggestions."
                : "No suggestions in this view."}
            </p>
          )}
        </>
      )}
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open && !pending) setEditing(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-lg sm:max-w-2xl">
          <DialogTitle>Review action</DialogTitle>
          {editing && (
            <fieldset disabled={pending}>
              <DraftEditor
                key={`${editing.draft.id}:${editing.version}`}
                draft={editing.draft}
                today={today}
                onCancel={() => setEditing(null)}
                onSave={(draft) =>
                  mutate(
                    editing.version
                      ? {
                          operation: "save",
                          items: [
                            { id: draft.id, version: editing.version, draft },
                          ],
                        }
                      : { operation: "import", items: [draft] },
                    "suggestions saved",
                  )
                }
              />
            </fieldset>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
