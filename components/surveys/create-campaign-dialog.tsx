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
import {
  QuestionBuilder,
  emptyQuestion,
  questionsFromDraft,
  type DraftQuestion,
} from "@/components/surveys/question-builder";
import { Plus } from "lucide-react";

export function CreateCampaignDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [creditDollars, setCreditDollars] = useState("50");
  const [expiresDays, setExpiresDays] = useState("180");
  const [questions, setQuestions] = useState<DraftQuestion[]>([emptyQuestion()]);

  async function handleSubmit() {
    if (!title.trim()) {
      toast.error("Give the campaign a title");
      return;
    }
    const built = questionsFromDraft(questions);
    if ("error" in built) {
      toast.error(built.error);
      return;
    }
    const cleaned = built.questions;

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

            <QuestionBuilder questions={questions} onChange={setQuestions} />
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
