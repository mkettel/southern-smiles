"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  Download,
  ExternalLink,
  FileText,
  History,
  Inbox,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  actionDraftSchema,
  approvalBlocker,
  importSuggestions,
  initialSuggestions,
  practiceToday,
  reviewSuggestions,
  suggestionStateSchema,
  toOicEntry,
  type ActionDraft,
  type ActionSuggestion,
  type SuggestionState,
} from "@/lib/action-log-suggestions";

const storageKey = "southern-smiles:action-log-preview:v1";
const selectClass =
  "h-9 w-full min-w-0 rounded-md border bg-background px-3 text-sm";
type View = "pending" | "accepted" | "dismissed";

function IconButton({
  label,
  children,
  onClick,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={label}
            onClick={onClick}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ActionLogPreview() {
  const [state, setState] = useState<SuggestionState | null>(null);
  const [storageError, setStorageError] = useState("");
  const [view, setView] = useState<View>("pending");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<ActionDraft | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastSaved = useRef<string | null>(null);
  const today = practiceToday();

  useEffect(() => {
    function load() {
      try {
        const raw = localStorage.getItem(storageKey);
        const next = raw
          ? suggestionStateSchema.parse(JSON.parse(raw))
          : initialSuggestions;
        lastSaved.current = raw;
        setState(next);
        setStorageError("");
      } catch {
        setStorageError(
          "Saved preview could not be read. Existing data has not been overwritten. Reload to retry; if this persists, the saved data needs recovery.",
        );
      }
    }
    load();
    function sync(event: StorageEvent) {
      if (event.key === storageKey) {
        load();
        setSelected([]);
      }
    }
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  function commit(next: SuggestionState) {
    try {
      if (localStorage.getItem(storageKey) !== lastSaved.current)
        throw new Error(
          "This preview changed in another tab. Reload before editing.",
        );
      const raw = JSON.stringify(suggestionStateSchema.parse(next));
      localStorage.setItem(storageKey, raw);
      lastSaved.current = raw;
      setState(next);
      setStorageError("");
      return true;
    } catch (error) {
      setStorageError(
        error instanceof Error
          ? error.message
          : "Could not save this preview. No changes applied.",
      );
      return false;
    }
  }

  function review(ids: string[], status: View) {
    if (!state) return;
    const next = reviewSuggestions(
      state,
      ids,
      status,
      new Date().toISOString(),
      today,
    );
    const changed = next.items.filter(
      (item, index) => item.status !== state.items[index].status,
    ).length;
    if (!changed) {
      toast.error("Confirm implementation and date before adding this action.");
      return;
    }
    if (commit(next)) {
      setSelected([]);
      toast.success(
        status === "accepted"
          ? `${changed} added to the local timeline`
          : status === "dismissed"
            ? `${changed} dismissed`
            : "Returned to suggestions",
      );
    }
  }

  function save(draft: ActionDraft) {
    if (!state) return;
    const existing = state.items.find((item) => item.id === draft.id);
    const item: ActionSuggestion = {
      ...draft,
      status: "pending",
      reviewed_at: null,
    };
    const next = {
      ...state,
      items: existing
        ? state.items.map((row) => (row.id === item.id ? item : row))
        : [item, ...state.items],
    };
    if (commit(next)) {
      setEditing(null);
      toast.success("Suggestion saved locally");
    }
  }

  async function importFile(file?: File) {
    if (!file || !state) return;
    if (file.size > 1_000_000) {
      toast.error("Choose a JSON file smaller than 1 MB.");
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    const beforeImport = lastSaved.current;
    setImporting(true);
    try {
      const result = importSuggestions(state, JSON.parse(await file.text()));
      if (lastSaved.current !== beforeImport) {
        toast.error(
          "The inbox changed during import. Please import the file again.",
        );
        return;
      }
      if (commit(result.state))
        toast.success(
          `${result.added} suggestions imported; duplicates skipped`,
        );
    } catch {
      toast.error(
        "Import rejected. Use an array of action drafts with valid dates and source links. Nothing was imported.",
      );
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function newNote() {
    const id = crypto.randomUUID();
    setEditing({
      id,
      source_key: `note:${id}`,
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
    });
  }

  if (!state)
    return (
      <div className="p-6" role="status">
        {storageError || "Loading suggestions..."}
      </div>
    );
  const counts = { pending: 0, accepted: 0, dismissed: 0 };
  state.items.forEach((item) => counts[item.status]++);
  const filtered = state.items
    .filter(
      (item) =>
        item.status === view &&
        `${item.title} ${item.entry_text} ${item.area} ${item.stats.join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => b.effective_date.localeCompare(a.effective_date));
  const ready = filtered.filter(
    (item) => !approvalBlocker(item, state.items, today),
  );
  const selectedReady = ready.filter((item) => selected.includes(item.id));

  return (
    <div className="mx-auto max-w-5xl space-y-6 [letter-spacing:0]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 text-xs font-medium text-muted-foreground">
            SOUTHERN SMILES / PRACTICE OPERATIONS
          </div>
          <h1 className="text-2xl font-bold">Action Log</h1>
        </div>
        <div className="flex gap-2">
          <IconButton
            label="Export suggestions"
            onClick={() =>
              download(
                "action-suggestions.json",
                state.items.map((item) => actionDraftSchema.parse(item)),
              )
            }
          >
            <Download className="size-4" />
          </IconButton>
          <Button
            variant="outline"
            onClick={() => fileInput.current?.click()}
            disabled={importing}
          >
            <Upload className="size-4" />
            Import
          </Button>
          <Button onClick={newNote}>
            <Plus className="size-4" />
            Quick note
          </Button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="hidden"
          aria-label="Import suggestions file"
          onChange={(event) => void importFile(event.target.files?.[0])}
        />
      </div>
      <div className="border-y border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
        Local preview · Saved in this browser only. Live Action Log unchanged.
      </div>
      {storageError && (
        <p role="alert" className="text-sm text-destructive">
          {storageError}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div
          role="tablist"
          aria-label="Action Log views"
          className="flex flex-wrap gap-1"
        >
          {(
            [
              { value: "pending", label: "Suggested actions", icon: Inbox },
              { value: "accepted", label: "Timeline", icon: History },
              { value: "dismissed", label: "Dismissed", icon: X },
            ] as const
          ).map(({ value, label, icon: Icon }) => (
            <Button
              key={value}
              role="tab"
              id={`tab-${value}`}
              aria-selected={view === value}
              aria-controls="action-panel"
              variant={view === value ? "secondary" : "ghost"}
              onClick={() => {
                setView(value);
                setSelected([]);
              }}
            >
              <Icon className="size-4" />
              {label}
              <span className="text-xs tabular-nums text-muted-foreground">
                {counts[value]}
              </span>
            </Button>
          ))}
        </div>
        <div className="relative w-full sm:w-60">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            aria-label="Search actions"
            placeholder="Search actions"
            className="pl-9"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected([]);
            }}
          />
        </div>
      </div>
      <section
        id="action-panel"
        role="tabpanel"
        aria-labelledby={`tab-${view}`}
        className="space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">
            {view === "pending"
              ? "Ready for your review"
              : view === "accepted"
                ? "Practice timeline"
                : "Dismissed suggestions"}
          </h2>
          {view === "pending" && (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  aria-label="Select ready actions"
                  disabled={!ready.length}
                  checked={
                    ready.length > 0 && selectedReady.length === ready.length
                  }
                  onChange={(event) =>
                    setSelected(
                      event.target.checked ? ready.map((item) => item.id) : [],
                    )
                  }
                />
                {ready.length} ready
              </label>
              <Button
                size="sm"
                disabled={!selectedReady.length}
                onClick={() =>
                  review(
                    selectedReady.map((item) => item.id),
                    "accepted",
                  )
                }
              >
                <Check className="size-4" />
                Add selected
                {selectedReady.length > 0 ? ` (${selectedReady.length})` : ""}
              </Button>
            </div>
          )}
          {view === "accepted" && (
            <IconButton
              label="Export timeline entries"
              onClick={() =>
                download(
                  "action-log-entries.json",
                  state.items
                    .filter((item) => item.status === "accepted")
                    .map(toOicEntry),
                )
              }
            >
              <Download className="size-4" />
            </IconButton>
          )}
        </div>
        {filtered.map((item) => {
          const blocker = approvalBlocker(item, state.items, today);
          return (
            <article
              key={item.id}
              className="rounded-lg border bg-card p-4 sm:p-5"
            >
              <div className="flex items-start gap-3">
                {view === "pending" && (
                  <input
                    type="checkbox"
                    className="mt-1.5 size-4 shrink-0"
                    aria-label={`Select ${item.title}`}
                    disabled={!!blocker}
                    checked={selected.includes(item.id)}
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
                          ? [...selected, item.id]
                          : selected.filter((id) => id !== item.id),
                      )
                    }
                  />
                )}
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="mb-1 text-xs text-muted-foreground">
                        {item.area || "General"}
                        {item.post_affected ? ` / ${item.post_affected}` : ""}
                      </div>
                      <h3 className="break-words text-base font-semibold">
                        {item.title}
                      </h3>
                    </div>
                    <span
                      className={`text-xs font-medium ${view === "pending" && blocker ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"}`}
                    >
                      {view === "pending"
                        ? blocker || "Ready to add"
                        : view === "accepted"
                          ? "Added locally"
                          : "Dismissed"}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-6">
                    {item.entry_text}
                  </p>
                  {!!item.stats.length && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <span className="font-medium text-muted-foreground">
                        Stats to watch
                      </span>
                      {item.stats.map((stat) => (
                        <span
                          className="break-words text-sky-700 dark:text-sky-400"
                          key={stat}
                        >
                          {stat}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                    <span>
                      {item.effective_date || "Date needed"}
                      {!item.date_confirmed ? " · unconfirmed" : ""}
                    </span>
                    {item.source_url ? (
                      <a
                        className="inline-flex max-w-full items-center gap-1 underline underline-offset-2"
                        href={item.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <span className="truncate">{item.source_label}</span>
                        <ExternalLink className="size-3 shrink-0" />
                      </a>
                    ) : (
                      <span>{item.source_label}</span>
                    )}
                  </div>
                  {!!item.evidence && view === "pending" && (
                    <p className="border-l-2 border-amber-300 pl-3 text-xs leading-5 text-muted-foreground">
                      {item.evidence}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                    <span className="text-xs text-muted-foreground">
                      {item.reviewed_at
                        ? `Reviewed locally ${new Date(item.reviewed_at).toLocaleDateString("en-US")}`
                        : "Awaiting review"}
                    </span>
                    <div className="flex items-center gap-1">
                      {view === "pending" ? (
                        <>
                          <IconButton
                            label={`Dismiss ${item.title}`}
                            onClick={() => review([item.id], "dismissed")}
                          >
                            <X className="size-4" />
                          </IconButton>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditing(item)}
                          >
                            <Pencil className="size-3.5" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            disabled={!!blocker}
                            onClick={() => review([item.id], "accepted")}
                          >
                            <Check className="size-4" />
                            Add
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => review([item.id], "pending")}
                        >
                          <RotateCcw className="size-3.5" />
                          {view === "accepted" ? "Undo add" : "Restore"}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
        {!filtered.length && (
          <div className="py-14 text-center">
            <FileText className="mx-auto mb-3 size-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {query
                ? "No matching actions."
                : view === "accepted"
                  ? "No actions added to this local timeline yet."
                  : view === "dismissed"
                    ? "No dismissed suggestions."
                    : "All caught up."}
            </p>
          </div>
        )}
      </section>
      <div className="border-t pt-4 text-xs text-muted-foreground">
        Sources: 2 merged Board changes · Google Ads and SEO not connected
      </div>
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-lg sm:max-w-2xl">
          <DialogTitle>
            {editing?.title ? "Review suggested action" : "Quick note"}
          </DialogTitle>
          {editing && (
            <DraftEditor
              key={editing.id}
              draft={editing}
              today={today}
              onSave={save}
              onCancel={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function DraftEditor({
  draft,
  today,
  onSave,
  onCancel,
}: {
  draft: ActionDraft;
  today: string;
  onSave: (draft: ActionDraft) => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(draft.date_confirmed);
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const text = (key: string) => String(form.get(key) ?? "");
        const result = actionDraftSchema.safeParse({
          ...draft,
          title: text("title"),
          entry_text: text("entry_text"),
          area: text("area"),
          post_affected: text("post_affected"),
          effective_date: text("effective_date"),
          date_confirmed: confirmed,
          implementation: text("implementation"),
          stats: [
            ...new Set(
              text("stats")
                .split(",")
                .map((stat) => stat.trim())
                .filter(Boolean),
            ),
          ],
          source_label: text("source_label"),
          source_url: text("source_url"),
        });
        if (!result.success) {
          setError(result.error.issues[0].message);
          return;
        }
        onSave(result.data);
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="draft-title">Action</Label>
        <Input
          id="draft-title"
          name="title"
          required
          maxLength={160}
          defaultValue={draft.title}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="draft-entry">What changed</Label>
        <Textarea
          id="draft-entry"
          name="entry_text"
          required
          maxLength={5000}
          rows={3}
          defaultValue={draft.entry_text}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="draft-implementation">Implementation</Label>
          <select
            id="draft-implementation"
            name="implementation"
            defaultValue={draft.implementation}
            className={selectClass}
          >
            <option value="unconfirmed">Needs confirmation</option>
            <option value="implemented">Implemented in the practice</option>
            <option value="planned">Planned / not live</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="draft-date">Effective date</Label>
          <Input
            id="draft-date"
            type="date"
            name="effective_date"
            max={today}
            defaultValue={draft.effective_date}
            onChange={() => setConfirmed(false)}
          />
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            I confirm this is the effective date
          </label>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="draft-area">Area</Label>
          <Input
            id="draft-area"
            name="area"
            maxLength={200}
            defaultValue={draft.area}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="draft-post">Post affected</Label>
          <Input
            id="draft-post"
            name="post_affected"
            maxLength={200}
            defaultValue={draft.post_affected}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="draft-stats">Stats to watch (comma-separated)</Label>
        <Input
          id="draft-stats"
          name="stats"
          defaultValue={draft.stats.join(", ")}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="draft-source">Source</Label>
          <Input
            id="draft-source"
            name="source_label"
            required
            maxLength={200}
            defaultValue={draft.source_label}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="draft-url">Source link (optional)</Label>
          <Input
            id="draft-url"
            name="source_url"
            type="url"
            defaultValue={draft.source_url}
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">
          <Check className="size-4" />
          Save suggestion
        </Button>
      </div>
    </form>
  );
}
