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
  Users,
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
import { deleteTask, setAssignmentStatus } from "@/actions/tasks";
import { CreateTaskDialog } from "./create-task-dialog";
import { AdminTaskDetailDialog } from "./admin-task-detail-dialog";
import { RejectTaskDialog } from "./reject-task-dialog";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "./haptics";

type Filter = "all" | "active" | "submitted" | "approved" | "overdue";

interface AdminTaskCenterProps {
  initialTasks: Task[];
  members: Profile[];
  viewerId: string;
}

const STATUS_TONE: Record<TaskStatus, { dot: string; pill: string; label: string }> = {
  assigned: {
    dot: "bg-muted-foreground/40",
    pill: "bg-muted text-muted-foreground",
    label: "Assigned",
  },
  in_progress: {
    dot: "bg-primary",
    pill: "bg-primary/10 text-primary",
    label: "In progress",
  },
  submitted: {
    dot: "bg-amber-500",
    pill: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    label: "Awaiting review",
  },
  approved: {
    dot: "bg-emerald-500",
    pill: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    label: "Approved",
  },
};

function isOverdue(due: string | null, status: TaskStatus): boolean {
  if (!due) return false;
  if (status === "submitted" || status === "approved") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(due) < today;
}

function getEffectiveStatus(task: Task): TaskStatus {
  // Take the "least progressed" assignment status (assigned ≺ in_progress ≺ submitted ≺ approved)
  // so a task with any unfinished assignment counts as active for filter rollups.
  const order: TaskStatus[] = ["assigned", "in_progress", "submitted", "approved"];
  const statuses = (task.assignments ?? []).map((a) => a.status);
  for (const s of order) if (statuses.includes(s)) return s;
  return "assigned";
}

function getInitials(name: string | undefined | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatDue(due: string | null): { label: string; tone: "overdue" | "today" | "soon" | "later" } | null {
  if (!due) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(due);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, tone: "overdue" };
  if (diff === 0) return { label: "Today", tone: "today" };
  if (diff === 1) return { label: "Tomorrow", tone: "soon" };
  if (diff < 7) return { label: `In ${diff}d`, tone: "soon" };
  return {
    label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    tone: "later",
  };
}

interface GroupRow {
  task: Task;
  assignment: TaskAssignment;
}

interface Group {
  profileId: string;
  profile: NonNullable<TaskAssignment["profile"]>;
  rows: GroupRow[];
  counts: { active: number; submitted: number; overdue: number; total: number };
}

export function AdminTaskCenter({
  initialTasks,
  members,
  viewerId,
}: AdminTaskCenterProps) {
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
      submitted += (t.assignments ?? []).filter((a) => a.status === "submitted").length;
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

  /**
   * Group rows by assignee. Multi-assignee tasks appear once per assignee section
   * with that person's individual status. Empty sections (people with no
   * matching tasks) are dropped.
   */
  const groups: Group[] = useMemo(() => {
    const map = new Map<string, Group>();

    // Seed groups from `members` so order is stable across rerenders even if
    // someone has zero tasks under the current filter.
    for (const m of members) {
      if (assigneeFilter !== "all" && m.id !== assigneeFilter) continue;
      map.set(m.id, {
        profileId: m.id,
        profile: { id: m.id, full_name: m.full_name, avatar_url: m.avatar_url, avatar_color: m.avatar_color },
        rows: [],
        counts: { active: 0, submitted: 0, overdue: 0, total: 0 },
      });
    }

    for (const task of filtered) {
      for (const a of task.assignments ?? []) {
        if (assigneeFilter !== "all" && a.profile_id !== assigneeFilter) continue;
        let group = map.get(a.profile_id);
        if (!group) {
          // Assignment from someone not in members (deactivated user) — still show them.
          if (!a.profile) continue;
          group = {
            profileId: a.profile_id,
            profile: a.profile,
            rows: [],
            counts: { active: 0, submitted: 0, overdue: 0, total: 0 },
          };
          map.set(a.profile_id, group);
        }
        group.rows.push({ task, assignment: a });
        group.counts.total++;
        if (a.status === "assigned" || a.status === "in_progress") group.counts.active++;
        if (a.status === "submitted") group.counts.submitted++;
        if (isOverdue(task.due_date, a.status)) group.counts.overdue++;
      }
    }

    // Drop empty groups, sort rows within each, and sort groups by attention
    // (submitted + overdue) descending, then alphabetical.
    const list = Array.from(map.values()).filter((g) => g.rows.length > 0);

    for (const g of list) {
      g.rows.sort((x, y) => {
        // Submitted first (admin needs to act on it)
        const xSub = x.assignment.status === "submitted" ? 0 : 1;
        const ySub = y.assignment.status === "submitted" ? 0 : 1;
        if (xSub !== ySub) return xSub - ySub;
        // Overdue next
        const xOver = isOverdue(x.task.due_date, x.assignment.status) ? 0 : 1;
        const yOver = isOverdue(y.task.due_date, y.assignment.status) ? 0 : 1;
        if (xOver !== yOver) return xOver - yOver;
        // Then by due date asc (nulls last)
        const xDue = x.task.due_date ? new Date(x.task.due_date).getTime() : Infinity;
        const yDue = y.task.due_date ? new Date(y.task.due_date).getTime() : Infinity;
        if (xDue !== yDue) return xDue - yDue;
        // Then by priority
        const pri = { high: 0, normal: 1, low: 2 } as const;
        return pri[x.task.priority] - pri[y.task.priority];
      });
    }

    list.sort((a, b) => {
      const aAttn = a.counts.submitted + a.counts.overdue;
      const bAttn = b.counts.submitted + b.counts.overdue;
      if (aAttn !== bAttn) return bAttn - aAttn;
      return (a.profile.full_name ?? "").localeCompare(b.profile.full_name ?? "");
    });

    return list;
  }, [filtered, members, assigneeFilter]);

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
      if (r?.error) toast.error("Couldn't delete");
      else toast.success("Task deleted");
    });
  }

  return (
    <div className="space-y-6">
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
                `Awaiting review (${counts.submitted})`,
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
                filter === id
                  ? `${tone} font-medium ring-1 ring-current/20`
                  : "text-muted-foreground hover:bg-muted"
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

      {/* Grouped task list */}
      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
          No tasks match this filter.
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.profileId} className="space-y-2">
              {/* Section header */}
              <div className="flex items-center gap-3 pb-1.5 border-b">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white shadow-sm ring-2 ring-background"
                  style={{ backgroundColor: group.profile.avatar_color ?? "#6b7280" }}
                >
                  {getInitials(group.profile.full_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold leading-tight">
                    {group.profile.full_name}
                    {group.profileId === viewerId && (
                      <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                        (You)
                      </span>
                    )}
                  </h2>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span>
                      {group.counts.total} task{group.counts.total === 1 ? "" : "s"}
                    </span>
                    {group.counts.active > 0 && (
                      <>
                        <span>·</span>
                        <span>{group.counts.active} active</span>
                      </>
                    )}
                    {group.counts.submitted > 0 && (
                      <>
                        <span>·</span>
                        <span className="font-medium text-amber-600 dark:text-amber-400">
                          {group.counts.submitted} awaiting review
                        </span>
                      </>
                    )}
                    {group.counts.overdue > 0 && (
                      <>
                        <span>·</span>
                        <span className="font-medium text-red-600 dark:text-red-400">
                          {group.counts.overdue} overdue
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Rows */}
              <ul className="divide-y rounded-xl border bg-card overflow-hidden">
                {group.rows.map(({ task, assignment }) => {
                  const due = formatDue(task.due_date);
                  const overdue = isOverdue(task.due_date, assignment.status);
                  const tone = STATUS_TONE[assignment.status];
                  const otherAssignees =
                    (task.assignments ?? []).filter(
                      (a) => a.profile_id !== assignment.profile_id
                    ) ?? [];
                  return (
                    <li
                      key={assignment.id}
                      onClick={() => setOpenTaskId(task.id)}
                      className={cn(
                        "group/row relative flex items-start gap-3 px-3 py-2.5 transition-colors cursor-pointer hover:bg-muted/40",
                        assignment.status === "submitted" && "bg-amber-500/[0.04]",
                        overdue && "bg-red-500/[0.04]"
                      )}
                    >
                      {/* Status dot */}
                      <span
                        className={cn(
                          "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                          tone.dot
                        )}
                        aria-hidden
                      />

                      {/* Body */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                          <h3
                            className={cn(
                              "flex-1 text-sm font-medium leading-snug",
                              assignment.status === "approved" &&
                                "text-muted-foreground line-through decoration-1"
                            )}
                          >
                            {task.title}
                          </h3>
                          {task.priority === "high" && (
                            <span className="shrink-0 rounded border border-red-500/20 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-700 dark:text-red-300">
                              High
                            </span>
                          )}
                          {task.priority === "low" && (
                            <span className="shrink-0 rounded border border-blue-500/20 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-700 dark:text-blue-300">
                              Low
                            </span>
                          )}
                        </div>

                        {task.description && (
                          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                            {task.description}
                          </p>
                        )}

                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
                          <span
                            className={cn(
                              "inline-flex items-center rounded px-1.5 py-0.5 font-medium",
                              tone.pill
                            )}
                          >
                            {tone.label}
                          </span>
                          {due && (
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 text-muted-foreground",
                                overdue && "font-medium text-red-600 dark:text-red-400",
                                due.tone === "today" && "font-medium text-amber-600 dark:text-amber-400"
                              )}
                            >
                              {overdue ? (
                                <AlertTriangle className="h-3 w-3" />
                              ) : (
                                <Calendar className="h-3 w-3" />
                              )}
                              {due.label}
                            </span>
                          )}
                          {(task.comment_count ?? 0) > 0 && (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <MessageCircle className="h-3 w-3" />
                              {task.comment_count}
                            </span>
                          )}
                          {otherAssignees.length > 0 && (
                            <span
                              className="inline-flex items-center gap-1 text-muted-foreground"
                              title={otherAssignees
                                .map((a) => a.profile?.full_name ?? "Unknown")
                                .join(", ")}
                            >
                              <Users className="h-3 w-3" />
                              + {otherAssignees.length}
                            </span>
                          )}
                        </div>

                        {assignment.review_note && assignment.status === "in_progress" && (
                          <div className="mt-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-[11px]">
                            <span className="font-medium text-amber-700 dark:text-amber-300">
                              Sent back:
                            </span>{" "}
                            <span className="text-foreground/80">
                              {assignment.review_note}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div
                        className="flex shrink-0 items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {assignment.status === "submitted" && (
                          <>
                            <button
                              onClick={() => handleApprove(task.id, assignment.id)}
                              className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 transition-colors"
                              title="Approve"
                            >
                              <Check className="h-3 w-3" />
                              Approve
                            </button>
                            <button
                              onClick={() =>
                                setRejecting({
                                  taskId: task.id,
                                  assignmentId: assignment.id,
                                  assigneeName: group.profile.full_name ?? "Assignee",
                                  taskTitle: task.title,
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-700 dark:text-red-300 hover:bg-red-500/20 transition-colors"
                              title="Send back"
                            >
                              <X className="h-3 w-3" />
                              Send back
                            </button>
                          </>
                        )}
                        <div className="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity">
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
            </section>
          ))}
        </div>
      )}

      <CreateTaskDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        members={members}
        viewerId={viewerId}
        onCreated={(task) => setTasks((prev) => [task, ...prev])}
      />

      {editingTask && (
        <CreateTaskDialog
          open
          onOpenChange={(v) => !v && setEditingTask(null)}
          members={members}
          viewerId={viewerId}
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
