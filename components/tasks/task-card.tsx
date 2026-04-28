"use client";

import { useState } from "react";
import { Check, Clock, MessageCircle, Calendar, ChevronRight } from "lucide-react";
import type { MyTaskItem, TaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

interface TaskCardProps {
  item: MyTaskItem;
  onStatusChange: (assignmentId: string, next: TaskStatus) => void;
  onOpen: () => void;
}

const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20",
  normal: "bg-muted text-muted-foreground border-border",
  low: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
};

function formatDue(due: string | null): {
  label: string;
  tone: "overdue" | "today" | "soon" | "later" | "none";
} {
  if (!due) return { label: "No due date", tone: "none" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(due);
  dueDate.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (dueDate.getTime() - today.getTime()) / 86400000
  );
  if (diffDays < 0) {
    const abs = Math.abs(diffDays);
    return { label: `Overdue ${abs}d`, tone: "overdue" };
  }
  if (diffDays === 0) return { label: "Due today", tone: "today" };
  if (diffDays === 1) return { label: "Due tomorrow", tone: "soon" };
  if (diffDays < 7) return { label: `Due in ${diffDays}d`, tone: "soon" };
  return {
    label: dueDate.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }),
    tone: "later",
  };
}

export function TaskCard({ item, onStatusChange, onOpen }: TaskCardProps) {
  const { task, assignment, coAssignees, comment_count } = item;
  const [isCompleting, setIsCompleting] = useState(false);
  const isDone = assignment.status === "submitted" || assignment.status === "approved";
  const isInProgress = assignment.status === "in_progress";
  const due = formatDue(task.due_date);

  function handleCheck(e: React.MouseEvent) {
    e.stopPropagation();
    if (isDone) {
      // Uncheck — go back to in_progress
      onStatusChange(assignment.id, "in_progress");
      return;
    }
    // Play the satisfying animation, then commit
    setIsCompleting(true);
    window.setTimeout(() => {
      onStatusChange(assignment.id, "submitted");
      setIsCompleting(false);
    }, 320);
  }

  function handleStartProgress(e: React.MouseEvent) {
    e.stopPropagation();
    if (isInProgress || isDone) return;
    onStatusChange(assignment.id, "in_progress");
  }

  return (
    <li>
      <div
        onClick={onOpen}
        className={cn(
          "group/task relative flex items-start gap-3 rounded-xl border bg-card p-3 text-left transition-all duration-200 cursor-pointer",
          "hover:border-foreground/20 hover:shadow-sm",
          isCompleting && "translate-x-1 opacity-0",
          isDone && "opacity-70",
          assignment.status === "approved" && "border-emerald-500/30 bg-emerald-500/[0.03]"
        )}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
      >
        {/* The satisfying checkbox */}
        <button
          type="button"
          onClick={handleCheck}
          aria-label={isDone ? "Mark as not done" : "Mark as done"}
          className={cn(
            "relative mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200 outline-none",
            "active:scale-90",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            isDone
              ? "border-primary bg-primary text-primary-foreground"
              : isInProgress
              ? "border-primary/60 bg-primary/10 hover:border-primary"
              : "border-muted-foreground/40 hover:border-primary hover:bg-primary/5"
          )}
        >
          <Check
            className={cn(
              "h-3.5 w-3.5 transition-all duration-200",
              isDone
                ? "scale-100 opacity-100"
                : "scale-0 opacity-0 group-hover/task:scale-75 group-hover/task:opacity-30"
            )}
            strokeWidth={3}
          />
          {isCompleting && (
            <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping" />
          )}
        </button>

        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <h3
              className={cn(
                "flex-1 text-sm font-medium leading-snug transition-all",
                isDone && "text-muted-foreground line-through decoration-2"
              )}
            >
              {task.title}
            </h3>
            {task.priority !== "normal" && (
              <span
                className={cn(
                  "shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                  PRIORITY_STYLES[task.priority]
                )}
              >
                {task.priority}
              </span>
            )}
          </div>
          {task.description && (
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
              {task.description}
            </p>
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {due.tone !== "none" && (
              <span
                className={cn(
                  "inline-flex items-center gap-1",
                  due.tone === "overdue" && "font-medium text-red-600 dark:text-red-400",
                  due.tone === "today" && "font-medium text-amber-600 dark:text-amber-400"
                )}
              >
                <Calendar className="h-3 w-3" />
                {due.label}
              </span>
            )}
            {isInProgress && (
              <span className="inline-flex items-center gap-1 text-primary">
                <Clock className="h-3 w-3" />
                In progress
              </span>
            )}
            {assignment.status === "submitted" && (
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                Awaiting review
              </span>
            )}
            {assignment.status === "approved" && (
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <Check className="h-3 w-3" />
                Approved
              </span>
            )}
            {comment_count > 0 && (
              <span className="inline-flex items-center gap-1">
                <MessageCircle className="h-3 w-3" />
                {comment_count}
              </span>
            )}
            {coAssignees.length > 0 && (
              <span>+{coAssignees.length} other{coAssignees.length === 1 ? "" : "s"}</span>
            )}
            {!isInProgress && !isDone && (
              <button
                onClick={handleStartProgress}
                className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-primary hover:bg-primary/10 transition-colors"
              >
                Start →
              </button>
            )}
          </div>

          {assignment.review_note && assignment.status !== "approved" && (
            <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs">
              <span className="font-medium text-amber-700 dark:text-amber-300">
                Review note:
              </span>{" "}
              <span className="text-foreground/80">{assignment.review_note}</span>
            </div>
          )}
        </div>

        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/50 opacity-0 transition-opacity group-hover/task:opacity-100" />
      </div>
    </li>
  );
}
