"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SurveyQuestion, SurveyQuestionType } from "@/lib/types";
import { Plus, Trash2 } from "lucide-react";

export interface DraftQuestion extends SurveyQuestion {
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
export function newQuestionId() {
  idCounter += 1;
  return `q${idCounter}_${Date.now().toString(36)}`;
}

export function emptyQuestion(): DraftQuestion {
  return { id: newQuestionId(), type: "text", label: "", required: false };
}

/** Convert saved questions into editable drafts (options → one-per-line text). */
export function draftFromQuestions(questions: SurveyQuestion[]): DraftQuestion[] {
  if (!questions || questions.length === 0) return [emptyQuestion()];
  return questions.map((q) => ({
    ...q,
    optionsText: q.options?.join("\n") ?? "",
  }));
}

/** Validate + convert drafts back to clean SurveyQuestion[]. */
export function questionsFromDraft(
  drafts: DraftQuestion[]
): { questions: SurveyQuestion[] } | { error: string } {
  const cleaned: SurveyQuestion[] = [];
  for (const q of drafts) {
    if (!q.label.trim()) return { error: "Every question needs a label" };
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
        return { error: `"${q.label}" needs at least 2 options (one per line)` };
      }
      base.options = options;
    }
    cleaned.push(base);
  }
  return { questions: cleaned };
}

export function QuestionBuilder({
  questions,
  onChange,
}: {
  questions: DraftQuestion[];
  onChange: (next: DraftQuestion[]) => void;
}) {
  function update(id: string, patch: Partial<DraftQuestion>) {
    onChange(questions.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }
  function remove(id: string) {
    onChange(questions.filter((q) => q.id !== id));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Questions</Label>
        <button
          type="button"
          onClick={() => onChange([...questions, emptyQuestion()])}
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <Plus className="h-3.5 w-3.5" />
          Add question
        </button>
      </div>

      {questions.map((q, i) => (
        <div key={q.id} className="space-y-2 rounded-lg border p-3">
          <div className="flex items-start gap-2">
            <span className="mt-2 text-sm text-muted-foreground">{i + 1}.</span>
            <div className="flex-1 space-y-2">
              <Input
                value={q.label}
                onChange={(e) => update(q.id, { label: e.target.value })}
                placeholder="Question text"
              />
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={q.type}
                  onChange={(e) =>
                    update(q.id, { type: e.target.value as SurveyQuestionType })
                  }
                  className="rounded-md border bg-background px-2 py-1.5 text-sm"
                >
                  {(Object.keys(TYPE_LABELS) as SurveyQuestionType[]).map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={q.required ?? false}
                    onChange={(e) => update(q.id, { required: e.target.checked })}
                  />
                  Required
                </label>
                {questions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => remove(q.id)}
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
                  onChange={(e) => update(q.id, { optionsText: e.target.value })}
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
  );
}
