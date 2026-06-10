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
import {
  QuestionBuilder,
  draftFromQuestions,
  questionsFromDraft,
  type DraftQuestion,
} from "@/components/surveys/question-builder";
import { updateCampaignQuestions } from "@/actions/surveys";
import type { SurveyQuestion } from "@/lib/types";
import { Pencil } from "lucide-react";

export function EditQuestionsDialog({
  campaignId,
  questions,
}: {
  campaignId: string;
  questions: SurveyQuestion[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState<DraftQuestion[]>(() =>
    draftFromQuestions(questions)
  );

  async function save() {
    const result = questionsFromDraft(drafts);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setLoading(true);
    const res = await updateCampaignQuestions(campaignId, result.questions);
    setLoading(false);
    if (res.error) {
      toast.error(typeof res.error === "string" ? res.error : "Could not save");
      return;
    }
    toast.success("Questions updated");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setDrafts(draftFromQuestions(questions)); // reset to saved on open
      }}
    >
      <DialogTrigger
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </DialogTrigger>
      <DialogPortal>
        <DialogOverlay />
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit survey questions</DialogTitle>
            <DialogDescription>
              Changes apply to new responses going forward. Answers already
              submitted are kept as-is.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <QuestionBuilder questions={drafts} onChange={setDrafts} />
          </div>

          <DialogFooter>
            <DialogClose className="inline-flex items-center rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">
              Cancel
            </DialogClose>
            <Button onClick={save} disabled={loading}>
              {loading ? "Saving…" : "Save questions"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
