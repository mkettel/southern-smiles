"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCampaign } from "@/actions/surveys";
import type { SurveyQuestion, SurveyQuestionType } from "@/lib/types";
import { Plus, Trash2 } from "lucide-react";

interface DraftQuestion extends SurveyQuestion {
  optionsText?: string;
}

const TYPE_LABELS: Record<SurveyQuestionType, string> = {
  referral_source: "How did you hear about us (choices)",
  single_choice: "Single choice",
  multi_choice: "Multiple choice",
  rating: "Rating (1–5)",
  text: "Free text",
};

const NEEDS_OPTIONS: SurveyQuestionType[] = [
  "single_choice",
  "multi_choice",
  "referral_source",
];

let idCounter = 0;
function newId() {
  idCounter += 1;
  return `q${idCounter}_${Date.now().toString(36)}`;
}

export function CreateCampaignDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [creditDollars, setCreditDollars] = useState("50");
  const [expiresDays, setExpiresDays] = useState("180");
  const [questions, setQuestions] = useState<DraftQuestion[]>([
    { id: newId(), type: "text", label: "", required: false },
  ]);

  function addQuestion() {
    setQuestions((q) => [
      ...q,
      { id: newId(), type: "text", label: "", required: false },
    ]);
  }

  function updateQuestion(id: string, patch: Partial<DraftQuestion>) {
    setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }

  function removeQuestion(id: string) {
    setQuestions((qs) => qs.filter((q) => q.id !== id));
  }

  async function handleSubmit() {
    if (!title.trim()) {
      toast.error("Give the campaign a title");
      return;
    }
    const cleaned: SurveyQuestion[] = [];
    for (const q of questions) {
      if (!q.label.trim()) {
        toast.error("Every question needs a label");
        return;
      }
      const base: SurveyQuestion = {
        id: q.id,
        type: q.type,
        label: q.label.trim(),
        required: q.required,
      };
      if (NEEDS_OPTIONS.includes(q.type)) {
        const options = (q.optionsText ?? "")
          .split("\n")
          .map((o) => o.trim())
          .filter(Boolean);
        if (options.length < 2) {
          toast.error(`"${q.label}" needs at least 2 options (one per line)`);
          return;
        }
        base.options = options;
      }
      cleaned.push(base);
    }

    const creditCents = Math.round((parseFloat(creditDollars) || 0) * 100);
    const expires = parseInt(expiresDays, 10);

    setLoading(true);
    const result = await createCampaign({
      title: title.trim(),
      questions: cleaned,
      credit_amount_cents: creditCents,
      credit_expires_days: Number.isFinite(expires) && expires > 0 ? expires : null,
    });
    setLoading(false);

    if (result.error) {
      toast.error(
        typeof result.error === "string" ? result.error : "Could not create campaign"
      );
      return;
    }
    toast.success("Campaign created");
    setOpen(false);
    // Refresh so the new campaign appears in the list immediately (clears the
    // client router cache), then open it to configure.
    router.refresh();
    if (result.id) router.push(`/admin/surveys/${result.id}`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-colors"
      >
        <Plus className="h-4 w-4" />
        New Campaign
      </DialogTrigger>
      <DialogPortal>
        <DialogOverlay />
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New survey campaign</DialogTitle>
            <DialogDescription>
              Set the questions Dr. Shakally wants on this mailing and the
              appreciation credit. You can generate codes and send after saving.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label htmlFor="campaign-title">Campaign title</Label>
              <Input
                id="campaign-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Spring 2026 Personal Note"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="credit">Appreciation credit ($)</Label>
                <Input
                  id="credit"
                  type="number"
                  min={0}
                  value={creditDollars}
                  onChange={(e) => setCreditDollars(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expires">Credit expires (days)</Label>
                <Input
                  id="expires"
                  type="number"
                  min={0}
                  value={expiresDays}
                  onChange={(e) => setExpiresDays(e.target.value)}
                  placeholder="blank = never"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Questions</Label>
                <button
                  type="button"
                  onClick={addQuestion}
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add question
                </button>
              </div>

              {questions.map((q, i) => (
                <div key={q.id} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-start gap-2">
                    <span className="mt-2 text-sm text-muted-foreground">
                      {i + 1}.
                    </span>
                    <div className="flex-1 space-y-2">
                      <Input
                        value={q.label}
                        onChange={(e) =>
                          updateQuestion(q.id, { label: e.target.value })
                        }
                        placeholder="Question text"
                      />
                      <div className="flex flex-wrap items-center gap-3">
                        <select
                          value={q.type}
                          onChange={(e) =>
                            updateQuestion(q.id, {
                              type: e.target.value as SurveyQuestionType,
                            })
                          }
                          className="rounded-md border bg-background px-2 py-1.5 text-sm"
                        >
                          {(
                            Object.keys(TYPE_LABELS) as SurveyQuestionType[]
                          ).map((t) => (
                            <option key={t} value={t}>
                              {TYPE_LABELS[t]}
                            </option>
                          ))}
                        </select>
                        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={q.required ?? false}
                            onChange={(e) =>
                              updateQuestion(q.id, { required: e.target.checked })
                            }
                          />
                          Required
                        </label>
                        {questions.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeQuestion(q.id)}
                            className="ml-auto text-muted-foreground hover:text-destructive"
                            aria-label="Remove question"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      {NEEDS_OPTIONS.includes(q.type) && (
                        <textarea
                          value={q.optionsText ?? ""}
                          onChange={(e) =>
                            updateQuestion(q.id, { optionsText: e.target.value })
                          }
                          rows={4}
                          placeholder={"One option per line\nReferred by friend\nOnline reviews\nLocation"}
                          className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                        />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <DialogClose className="inline-flex items-center rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">
              Cancel
            </DialogClose>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? "Creating…" : "Create campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
