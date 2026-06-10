"use client";

import { useState } from "react";
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { SurveyResponse, SurveyQuestion } from "@/lib/types";
import { ChevronRight } from "lucide-react";

function formatAnswer(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (typeof v === "string") return v.trim() || "—";
  return String(v);
}

export function ResponseFeed({
  responses,
  questions,
}: {
  responses: SurveyResponse[];
  questions: SurveyQuestion[];
}) {
  const [active, setActive] = useState<SurveyResponse | null>(null);

  return (
    <div className="space-y-3">
      {/* Questions reference — always visible, so you can see what was asked */}
      {questions.length > 0 && (
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Survey questions
          </p>
          <ol className="list-decimal space-y-0.5 pl-4 text-sm">
            {questions.map((q) => (
              <li key={q.id}>{q.label}</li>
            ))}
          </ol>
        </div>
      )}

      {/* Responses */}
      {responses.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No responses yet.
        </p>
      ) : (
        <div>
          {responses.map((r) => (
            <button
              key={r.id}
              onClick={() => setActive(r)}
              className="flex w-full items-center justify-between gap-3 border-b px-1 py-2.5 text-left text-sm transition-colors last:border-0 hover:bg-muted/50"
            >
              <span className="font-medium">
                {r.patient?.full_name ?? "A patient"}
              </span>
              <span className="flex items-center gap-1 text-muted-foreground">
                {r.referral_source ? `via ${r.referral_source} · ` : ""}
                {new Date(r.submitted_at).toLocaleDateString()}
                <ChevronRight className="h-4 w-4" />
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Detail: every question + this patient's answer */}
      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogPortal>
          <DialogOverlay />
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {active?.patient?.full_name ?? "Response"}
              </DialogTitle>
              <DialogDescription>
                {active &&
                  `Submitted ${new Date(active.submitted_at).toLocaleString()}`}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {questions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This campaign has no questions configured.
                </p>
              ) : (
                questions.map((q, i) => (
                  <div key={q.id}>
                    <p className="text-xs font-medium text-muted-foreground">
                      {i + 1}. {q.label}
                    </p>
                    <p className="mt-0.5 text-sm">
                      {formatAnswer(active?.answers?.[q.id])}
                    </p>
                  </div>
                ))
              )}
            </div>
          </DialogContent>
        </DialogPortal>
      </Dialog>
    </div>
  );
}
