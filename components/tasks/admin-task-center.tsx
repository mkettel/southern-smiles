"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Plus,
  Calendar,
  Check,
  X,
  MessageCircle,
  Trash2,
  Pencil,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import type { Profile, Task, TaskAssignment, TaskStatus } from "@/lib/types";
import {
  deleteTask,
  setAssignmentStatus,
} from "@/actions/tasks";
import { CreateTaskDialog } from "./create-task-dialog";
import { AdminTaskDetailDialog } from "./admin-task-detail-dialog";
import { RejectTaskDialog } from "./reject-task-dialog";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "./haptics";

type Filter = "all" | "active" | "submitted" | "approved" | "overdue";

interface AdminTaskCenterProps {
  initialTasks: Task[];
  members: Profile[];
}

const STATUS_BADGE: Record<TaskStatus, string> = {
  assigned: "bg-muted text-muted-foreground",
  in_progress: "bg-primary/10 text-primary",
  submitted: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  assigned: "Assigned",
  in_progress: "In progress",
  submitted: "Submitted",
  approved: "Approved",
};

function isOverdue(due: string | null, status: TaskStatus): boolean {
  if (!due) return false;
  if (status === "submitted" || status === "approved") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(due) < today;
}

function getEffectiveStatus(task: Task): TaskStatus {
  // For filter rollups: take the "least progressed" assignment status
  // (assigned beats in_progress beats submitted beats approved).
  // This way "active" surfaces tasks where someone hasn't finished yet.
  const order: TaskStatus[] = ["assigned", "in_progress", "submitted", "approved"];
  const statuses = (task.assignments ?? []).map((a) => a.status);
  for (const s of order) if (statuses.includes(s)) return s;
  return "assigned";
}

export function AdminTaskCenter({ initialTasks, members }: AdminTaskCenterProps) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [filter, setFilter] = useState<Filter>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<{
    taskId: string;
    assignmentId: string;
    assigneeName: string;
    taskTitle: string;
  } | null>(null);
  const [, startTransition] = useTransition();

  const counts = useMemo(() => {
    let active = 0;
    let submitted = 0;
    let overdue = 0;
    for (const t of tasks) {
      const eff = getEffectiveStatus(t);
      if (eff === "assigned" || eff === "in_progress") active++;
      const subs = (t.assignments ?? []).filter((a) => a.status === "submitted").length;
      submitted += subs;
      if ((t.assignments ?? []).some((a) => isOverdue(t.due_date, a.status))) overdue++;
    }
    return { active, submitted, overdue };
  }, [tasks]);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (assigneeFilter !== "all") {
        if (!(t.assignments ?? []).some((a) => a.profile_id === assigneeFilter)) {
          return false;
        }
      }
      if (filter === "all") return true;
      if (filter === "overdue") {
        return (t.assignments ?? []).some((a) => isOverdue(t.due_date, a.status));
      }
      const eff = getEffectiveStatus(t);
      if (filter === "active") return eff === "assigned" || eff === "in_progress";
      if (filter === "submitted") {
        return (t.assignments ?? []).some((a) => a.status === "submitted");
      }
      if (filter === "approved") {
        return (t.assignments ?? []).every((a) => a.status === "approved");
      }
      return true;
    });
  }, [tasks, filter, assigneeFilter]);

  function applyAssignmentUpdate(
    taskId: string,
    assignmentId: string,
    patch: Partial<TaskAssignment>
  ) {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              assignments: (t.assignments ?? []).map((a) =>
                a.id === assignmentId ? { ...a, ...patch } : a
              ),
            }
          : t
      )
    );
  }

  function handleApprove(taskId: string, assignmentId: string) {
    triggerHaptic("success");
    applyAssignmentUpdate(taskId, assignmentId, {
      status: "approved",
      approved_at: new Date().toISOString(),
    });
    toast.success("Approved");
    startTransition(async () => {
      const r = await setAssignmentStatus(assignmentId, "approved");
      if (r?.error) toast.error("Couldn't approve");
    });
  }

  function handleReject(taskId: string, assignmentId: string, note: string) {
    triggerHaptic("warn");
    applyAssignmentUpdate(taskId, assignmentId, {
      status: "in_progress",
      review_note: note,
      completed_at: null,
    });
    toast("Sent back for revision");
    startTransition(async () => {
      const r = await setAssignmentStatus(assignmentId, "in_progress", note);
      if (r?.error) toast.error("Couldn't send back");
    });
  }

  function handleDelete(taskId: string) {
    if (!confirm("Delete this task? This can't be undone.")) return;
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    startTransition(async () => {
      const r = await deleteTask(taskId);
      if (r?.error) {
        toast.error("Couldn't delete");
      } else {
        toast.success("Task deleted");
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => setCreateOpen(true)} size="sm">
          <Plus className="h-3.5 w-3.5" />
          New task
        </Button>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {(
            [
              ["all", `All (${tasks.length})`, "bg-muted"],
              ["active", `Active (${counts.active})`, "bg-primary/10 text-primary"],
              [
                "submitted",
                `Submitted (${counts.submitted})`,
                "bg-amber-500/15 text-amber-700 dark:text-amber-300",
              ],
              [
                "overdue",
                `Overdue (${counts.overdue})`,
                "bg-red-500/15 text-red-700 dark:text-red-300",
              ],
              ["approved", "Approved", "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"],
            ] as const
          ).map(([id, label, tone]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={cn(
                "rounded-full px-2.5 py-1 transition-all",
                filter === id ? `${tone} font-medium ring-1 ring-current/20` : "text-muted-foreground hover:bg-muted"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="ml-auto">
          <Select
            value={assigneeFilter}
            onValueChange={(v) => v && setAssigneeFilter(v)}
          >
            <SelectTrigger size="sm" className="min-w-40">
              <SelectValue placeholder="All assignees" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All assignees</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
          No tasks match this filter.
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((task) => {
            const overdue = (task.assignments ?? []).some((a) =>
              isOverdue(task.due_date, a.status)
            );
            return (
              <li
                key={task.id}
                onClick={() => setOpenTaskId(task.id)}
                className={cn(
                  "group/task rounded-xl border bg-card p-3 transition-all cursor-pointer hover:border-foreground/20 hover:shadow-sm",
                  overdue && "border-red-500/30"
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2">
                      <h3 className="flex-1 text-sm font-medium leading-snug">
                        {task.title}
                      </h3>
                      {overdue && (
                        <span className="inline-flex items-center gap-1 rounded border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:text-red-300">
                          <AlertTriangle className="h-3 w-3" />
                          Overdue
                        </span>
                      )}
                      {task.priority === "high" && (
                        <span className="rounded border border-red-500/20 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-700 dark:text-red-300">
                          High
                        </span>
                      )}
                    </div>

                    {task.description && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                        {task.description}
                      </p>
                    )}

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      {task.due_date && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(task.due_date).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      )}
                      {(task.comment_count ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <MessageCircle className="h-3 w-3" />
                          {task.comment_count}
                        </span>
                      )}
                    </div>

                    {/* Per-assignee row */}
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      {(task.assignments ?? []).map((a) => (
                        <div
                          key={a.id}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border bg-background px-2 py-0.5 text-[11px]",
                            isOverdue(task.due_date, a.status) && "border-red-500/30"
                          )}
                        >
                          <span
                            className="h-4 w-4 rounded-full flex items-center justify-center text-[8px] font-medium text-white"
                            style={{ backgroundColor: a.profile?.avatar_color ?? "#6b7280" }}
                          >
                            {(a.profile?.full_name ?? "?")
                              .split(" ")
                              .map((n) => n[0] ?? "")
                              .join("")
                              .slice(0, 2)
                              .toUpperCase()}
                          </span>
                          <span>{a.profile?.full_name?.split(" ")[0] ?? "—"}</span>
                          <span className={cn("rounded px-1 text-[10px]", STATUS_BADGE[a.status])}>
                            {STATUS_LABEL[a.status]}
                          </span>
                          {a.status === "submitted" && (
                            <div className="flex gap-0.5 ml-0.5" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => handleApprove(task.id, a.id)}
                                className="rounded p-0.5 text-emerald-600 hover:bg-emerald-500/15"
                                title="Approve"
                                aria-label="Approve"
                              >
                                <Check className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() =>
                                  setRejecting({
                                    taskId: task.id,
                                    assignmentId: a.id,
                                    assigneeName: a.profile?.full_name ?? "Assignee",
                                    taskTitle: task.title,
                                  })
                                }
                                className="rounded p-0.5 text-red-600 hover:bg-red-500/15"
                                title="Send back"
                                aria-label="Send back"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div
                    className="flex flex-col gap-1 opacity-0 group-hover/task:opacity-100 transition-opacity"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => setEditingTask(task)}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="Edit"
                      aria-label="Edit task"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(task.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                      title="Delete"
                      aria-label="Delete task"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <CreateTaskDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        members={members}
        onCreated={(task) => setTasks((prev) => [task, ...prev])}
      />

      {editingTask && (
        <CreateTaskDialog
          open
          onOpenChange={(v) => !v && setEditingTask(null)}
          members={members}
          editing={editingTask}
          onUpdated={(updated) =>
            setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
          }
        />
      )}

      <AdminTaskDetailDialog
        task={openTaskId ? tasks.find((t) => t.id === openTaskId) ?? null : null}
        open={openTaskId !== null}
        onClose={() => setOpenTaskId(null)}
        onApprove={(assignmentId) => {
          const t = tasks.find((x) =>
            (x.assignments ?? []).some((a) => a.id === assignmentId)
          );
          if (t) handleApprove(t.id, assignmentId);
        }}
        onRequestReject={(assignmentId) => {
          const t = tasks.find((x) =>
            (x.assignments ?? []).some((a) => a.id === assignmentId)
          );
          const a = t?.assignments?.find((x) => x.id === assignmentId);
          if (t && a) {
            setRejecting({
              taskId: t.id,
              assignmentId,
              assigneeName: a.profile?.full_name ?? "Assignee",
              taskTitle: t.title,
            });
          }
        }}
      />

      <RejectTaskDialog
        open={rejecting !== null}
        onOpenChange={(v) => !v && setRejecting(null)}
        assigneeName={rejecting?.assigneeName}
        taskTitle={rejecting?.taskTitle}
        onConfirm={(note) => {
          if (!rejecting) return;
          handleReject(rejecting.taskId, rejecting.assignmentId, note);
          setRejecting(null);
        }}
      />
    </div>
  );
}
