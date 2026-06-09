"use client";

import { useState } from "react";
import { submitSurveyResponse } from "@/actions/survey-public";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { SurveyQuestion } from "@/lib/types";
import { CheckCircle2, Gift } from "lucide-react";

type AnswerValue = string | string[];

const RATING_SCALE = [1, 2, 3, 4, 5];

function formatCredit(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

export function SurveyForm({
  code,
  patientFirstName,
  campaignTitle,
  questions,
  creditAmountCents,
}: {
  code: string;
  patientFirstName: string;
  campaignTitle: string;
  questions: SurveyQuestion[];
  creditAmountCents: number;
}) {
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setAnswer(id: string, value: AnswerValue) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  function toggleMulti(id: string, option: string) {
    setAnswers((prev) => {
      const current = Array.isArray(prev[id]) ? (prev[id] as string[]) : [];
      const next = current.includes(option)
        ? current.filter((o) => o !== option)
        : [...current, option];
      return { ...prev, [id]: next };
    });
  }

  async function handleSubmit() {
    setError(null);

    // Client-side required check for a friendly inline message.
    for (const q of questions) {
      if (!q.required) continue;
      const v = answers[q.id];
      const empty =
        v === undefined ||
        v === null ||
        (typeof v === "string" && v.trim() === "") ||
        (Array.isArray(v) && v.length === 0);
      if (empty) {
        setError(`Please answer: ${q.label}`);
        return;
      }
    }

    setSubmitting(true);
    const result = await submitSurveyResponse({ code, answers });
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <CheckCircle2 className="mb-2 h-12 w-12 text-green-600 dark:text-green-500" />
          <CardTitle>Thank you, {patientFirstName}!</CardTitle>
          <CardDescription>
            Your feedback means the world to us. Your{" "}
            {formatCredit(creditAmountCents)} appreciation credit will be applied
            to your account.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Hi {patientFirstName} 👋</CardTitle>
        <CardDescription>{campaignTitle}</CardDescription>
        {creditAmountCents > 0 && (
          <div className="mt-2 flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">
            <Gift className="h-4 w-4 shrink-0" />
            <span>
              As a thank-you, enjoy a {formatCredit(creditAmountCents)}{" "}
              appreciation credit toward any future treatment.
            </span>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-7">
        {questions.map((q, i) => (
          <div key={q.id} className="space-y-2.5">
            <label className="block text-sm font-medium">
              <span className="text-muted-foreground">{i + 1}. </span>
              {q.label}
              {q.required && <span className="ml-0.5 text-destructive">*</span>}
            </label>

            {q.type === "text" && (
              <Textarea
                value={(answers[q.id] as string) ?? ""}
                onChange={(e) => setAnswer(q.id, e.target.value)}
                rows={3}
                placeholder="Your answer…"
                maxLength={2000}
              />
            )}

            {q.type === "rating" && (
              <div className="flex gap-2">
                {RATING_SCALE.map((n) => {
                  const selected = answers[q.id] === String(n);
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setAnswer(q.id, String(n))}
                      className={cn(
                        "flex h-11 w-11 items-center justify-center rounded-lg border text-sm font-medium transition-colors",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input hover:bg-muted"
                      )}
                      aria-pressed={selected}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            )}

            {(q.type === "single_choice" || q.type === "referral_source") && (
              <div className="grid gap-2">
                {(q.options ?? []).map((opt) => {
                  const selected = answers[q.id] === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setAnswer(q.id, opt)}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                        selected
                          ? "border-primary bg-primary/5"
                          : "border-input hover:bg-muted"
                      )}
                      aria-pressed={selected}
                    >
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                          selected ? "border-primary" : "border-muted-foreground/40"
                        )}
                      >
                        {selected && (
                          <span className="h-2 w-2 rounded-full bg-primary" />
                        )}
                      </span>
                      {opt}
                    </button>
                  );
                })}
              </div>
            )}

            {q.type === "multi_choice" && (
              <div className="grid gap-2">
                {(q.options ?? []).map((opt) => {
                  const current = Array.isArray(answers[q.id])
                    ? (answers[q.id] as string[])
                    : [];
                  const selected = current.includes(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => toggleMulti(q.id, opt)}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                        selected
                          ? "border-primary bg-primary/5"
                          : "border-input hover:bg-muted"
                      )}
                      aria-pressed={selected}
                    >
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                          selected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/40"
                        )}
                      >
                        {selected && <CheckCircle2 className="h-3 w-3" />}
                      </span>
                      {opt}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full"
          size="lg"
        >
          {submitting ? "Submitting…" : "Submit feedback"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Southern Smiles · Your responses are private.
        </p>
      </CardContent>
    </Card>
  );
}
