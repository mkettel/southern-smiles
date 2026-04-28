"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Calendar, Check, Clock, Send, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { MyTaskItem, TaskComment, TaskStatus } from "@/lib/types";
import { addTaskComment, getTaskComments } from "@/actions/tasks";

interface TaskDetailDialogProps {
  item: MyTaskItem | null;
  open: boolean;
  onClose: () => void;
  onStatusChange: (assignmentId: string, next: TaskStatus) => void;
}

export function TaskDetailDialog({
  item,
  open,
  onClose,
  onStatusChange,
}: TaskDetailDialogProps) {
  const [comments, setComments] = useState<TaskComment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [, startTransition] = useTransition();
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (!open || !item) {
      setComments(null);
      setDraft("");
      return;
    }
    let cancelled = false;
    getTaskComments(item.task.id).then((data) => {
      if (!cancelled) setComments(data);
    });
    return () => {
      cancelled = true;
    };
  }, [open, item]);

  if (!item) return null;
  const { task, assignment, coAssignees } = item;

  function handleSendComment() {
    if (!item) return;
    if (!draft.trim()) return;
    setIsSending(true);
    const message = draft.trim();
    const optimistic: TaskComment = {
      id: `temp-${Date.now()}`,
      task_id: item.task.id,
      profile_id: "self",
      practice_id: item.task.practice_id,
      message,
      created_at: new Date().toISOString(),
    };
    setComments((prev) => [...(prev ?? []), optimistic]);
    setDraft("");
    startTransition(async () => {
      const result = await addTaskComment(item.task.id, message);
      setIsSending(false);
      if (result?.error) {
        toast.error("Couldn't send comment");
        setComments((prev) => prev?.filter((c) => c.id !== optimistic.id) ?? null);
      } else {
        // Refresh authoritative copy with profile info
        const fresh = await getTaskComments(item.task.id);
        setComments(fresh);
      }
    });
  }

  const dueLabel = task.due_date
    ? new Date(task.due_date).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="border-b p-4">
          <DialogTitle className="pr-8 text-base">{task.title}</DialogTitle>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {dueLabel && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {dueLabel}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              {task.priority === "high" && (
                <span className="text-red-600 dark:text-red-400 font-medium">High priority</span>
              )}
              {task.priority === "low" && <span>Low priority</span>}
            </span>
            {task.creator?.full_name && <span>From {task.creator.full_name}</span>}
            {coAssignees.length > 0 && (
              <span>
                Also assigned to{" "}
                {coAssignees
                  .map((c) => c.profile?.full_name?.split(" ")[0] ?? "someone")
                  .join(", ")}
              </span>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {task.description && (
            <p className="text-sm whitespace-pre-wrap text-foreground/90">
              {task.description}
            </p>
          )}

          {assignment.review_note && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
              <div className="font-medium text-amber-700 dark:text-amber-300 mb-1">
                Review note from admin
              </div>
              <p className="text-foreground/80">{assignment.review_note}</p>
            </div>
          )}

          <div className="border-t pt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Comments
            </h4>
            {comments === null ? (
              <div className="text-xs text-muted-foreground">Loading…</div>
            ) : comments.length === 0 ? (
              <div className="text-xs text-muted-foreground">
                No comments yet. Add one below if you need clarification.
              </div>
            ) : (
              <ul className="space-y-3">
                {comments.map((c) => (
                  <li key={c.id} className="flex gap-2.5">
                    <div
                      className="h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-[10px] font-medium text-white"
                      style={{ backgroundColor: c.profile?.avatar_color ?? "#6b7280" }}
                    >
                      {(c.profile?.full_name ?? "?")
                        .split(" ")
                        .map((n) => n[0] ?? "")
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs">
                        <span className="font-medium">
                          {c.profile?.full_name ?? "You"}
                        </span>
                        <span className="ml-2 text-muted-foreground">
                          {new Date(c.created_at).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap mt-0.5">
                        {c.message}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="border-t p-3 space-y-3">
          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {assignment.status === "assigned" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onStatusChange(assignment.id, "in_progress")}
              >
                <Clock className="h-3.5 w-3.5" />
                Start
              </Button>
            )}
            {(assignment.status === "assigned" ||
              assignment.status === "in_progress") && (
              <Button
                size="sm"
                onClick={() => {
                  onStatusChange(assignment.id, "submitted");
                  onClose();
                }}
              >
                <Check className="h-3.5 w-3.5" />
                Submit for review
              </Button>
            )}
            {assignment.status === "submitted" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onStatusChange(assignment.id, "in_progress")}
              >
                <X className="h-3.5 w-3.5" />
                Withdraw submission
              </Button>
            )}
            {assignment.status === "approved" && (
              <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                <Check className="h-4 w-4" />
                Approved by admin
              </span>
            )}
          </div>

          {/* Comment composer */}
          <div className="flex items-end gap-2">
            <Textarea
              placeholder="Ask for clarification or add a note…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              className="resize-none text-sm"
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  handleSendComment();
                }
              }}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!draft.trim() || isSending}
              onClick={handleSendComment}
              aria-label="Send comment"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

