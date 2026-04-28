"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface RejectTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assigneeName?: string;
  taskTitle?: string;
  onConfirm: (note: string) => void;
}

export function RejectTaskDialog({
  open,
  onOpenChange,
  assigneeName,
  taskTitle,
  onConfirm,
}: RejectTaskDialogProps) {
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) setNote("");
  }, [open]);

  function handleConfirm() {
    onConfirm(note.trim());
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send back for revision</DialogTitle>
          <DialogDescription>
            {assigneeName
              ? `${assigneeName} will see this note and the task moves back to In Progress.`
              : "The assignee will see this note and the task moves back to In Progress."}
          </DialogDescription>
        </DialogHeader>

        {taskTitle && (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {taskTitle}
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="reject-note" className="text-xs font-medium">
            What needs to change? <span className="text-muted-foreground">(optional)</span>
          </label>
          <Textarea
            id="reject-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Looks great but missing the supply totals — please add and resubmit."
            rows={4}
            autoFocus
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                handleConfirm();
              }
            }}
          />
          <p className="text-[11px] text-muted-foreground">
            Leave blank to send back without a note. ⌘/Ctrl + Enter to submit.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm}>
            <X className="h-3.5 w-3.5" />
            Send back
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
