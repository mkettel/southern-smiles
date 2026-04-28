"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Calendar, Check, Send, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Task, TaskComment, TaskStatus } from "@/lib/types";
import { addTaskComment, getTaskComments } from "@/actions/tasks";
import { cn } from "@/lib/utils";

interface AdminTaskDetailDialogProps {
  task: Task | null;
  open: boolean;
  onClose: () => void;
  onApprove: (assignmentId: string) => void;
  /** Asks the parent to open the reject-with-note dialog. */
  onRequestReject: (assignmentId: string) => void;
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  assigned: "Assigned",
  in_progress: "In progress",
  submitted: "Submitted",
  approved: "Approved",
};

const STATUS_TONE: Record<TaskStatus, string> = {
  assigned: "bg-muted text-muted-foreground",
  in_progress: "bg-primary/10 text-primary",
  submitted: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

export function AdminTaskDetailDialog({
  task,
  open,
  onClose,
  onApprove,
  onRequestReject,
}: AdminTaskDetailDialogProps) {
  const [comments, setComments] = useState<TaskComment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!open || !task) {
      setComments(null);
      setDraft("");
      return;
    }
    let cancelled = false;
    getTaskComments(task.id).then((data) => {
      if (!cancelled) setComments(data);
    });
    return () => {
      cancelled = true;
    };
  }, [open, task]);

  if (!task) return null;

  function handleSendComment() {
    if (!task || !draft.trim()) return;
    const message = draft.trim();
    const optimistic: TaskComment = {
      id: `temp-${Date.now()}`,
      task_id: task.id,
      profile_id: "self",
      practice_id: task.practice_id,
      message,
      created_at: new Date().toISOString(),
    };
    setComments((prev) => [...(prev ?? []), optimistic]);
    setDraft("");
    startTransition(async () => {
      const r = await addTaskComment(task.id, message);
      if (r?.error) {
        toast.error("Couldn't send");
        setComments((prev) => prev?.filter((c) => c.id !== optimistic.id) ?? null);
      } else {
        const fresh = await getTaskComments(task.id);
        setComments(fresh);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="border-b p-4">
          <DialogTitle className="pr-8 text-base">{task.title}</DialogTitle>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {task.due_date && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {new Date(task.due_date).toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </span>
            )}
            {task.priority !== "normal" && (
              <span className="capitalize">{task.priority} priority</span>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {task.description && (
            <p className="text-sm whitespace-pre-wrap text-foreground/90">
              {task.description}
            </p>
          )}

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Assignees
            </h4>
            <ul className="space-y-1.5">
              {(task.assignments ?? []).map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-2 rounded-lg border bg-background p-2"
                >
                  <span
                    className="h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-medium text-white"
                    style={{ backgroundColor: a.profile?.avatar_color ?? "#6b7280" }}
                  >
                    {(a.profile?.full_name ?? "?")
                      .split(" ")
                      .map((n) => n[0] ?? "")
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                  <span className="flex-1 text-sm">{a.profile?.full_name}</span>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-medium",
                      STATUS_TONE[a.status]
                    )}
                  >
                    {STATUS_LABEL[a.status]}
                  </span>
                  {a.status === "submitted" && (
                    <div className="flex gap-1">
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => onApprove(a.id)}
                      >
                        <Check className="h-3 w-3" />
                        Approve
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => onRequestReject(a.id)}
                      >
                        <X className="h-3 w-3" />
                        Send back
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t pt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Comments
            </h4>
            {comments === null ? (
              <div className="text-xs text-muted-foreground">Loading…</div>
            ) : comments.length === 0 ? (
              <div className="text-xs text-muted-foreground">No comments yet.</div>
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

        <div className="border-t p-3">
          <div className="flex items-end gap-2">
            <Textarea
              placeholder="Comment on this task…"
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
              disabled={!draft.trim()}
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
