"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ListTodo,
  Sparkles,
} from "lucide-react";
import type { MyTaskItem, TaskStatus } from "@/lib/types";
import { setAssignmentStatus } from "@/actions/tasks";
import { TaskCard } from "./task-card";
import { TaskDetailDialog } from "./task-detail-dialog";
import { triggerHaptic } from "./haptics";
import { cn } from "@/lib/utils";

const COMPLETED_VISIBLE_MS = 24 * 60 * 60 * 1000; // 24 hours
const COMPLETED_AUTO_COLLAPSE = 10;

type Tab = "active" | "submitted" | "approved";

interface TaskListClientProps {
  initialItems: MyTaskItem[];
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function TaskListClient({ initialItems }: TaskListClientProps) {
  const [items, setItems] = useState<MyTaskItem[]>(initialItems);
  const [tab, setTab] = useState<Tab>("active");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  // null = "use the auto-collapse default based on count"; true/false = user override
  const [completedExpanded, setCompletedExpanded] = useState<boolean | null>(null);
  const [, startTransition] = useTransition();

  const counts = useMemo(() => {
    let active = 0;
    let submitted = 0;
    let approved = 0;
    let doneToday = 0;
    const today = new Date();
    for (const item of items) {
      const s = item.assignment.status;
      if (s === "assigned" || s === "in_progress") active++;
      else if (s === "submitted") submitted++;
      else if (s === "approved") approved++;
      if (item.assignment.completed_at) {
        const d = new Date(item.assignment.completed_at);
        if (isSameDay(d, today)) doneToday++;
      }
    }
    return { active, submitted, approved, doneToday };
  }, [items]);

  /**
   * For the Active tab we keep recently-completed tasks visible for 24 hours
   * with strikethrough styling, then they fall away into the Submitted /
   * Approved buckets. The visible-but-done pile gives a satisfying sense of
   * accomplishment without cluttering the long-term archive.
   */
  const { activeRows, completedRecently, filteredFlat } = useMemo(() => {
    const now = Date.now();
    const priOrder = { high: 0, normal: 1, low: 2 } as const;

    if (tab === "active") {
      const active: MyTaskItem[] = [];
      const recent: MyTaskItem[] = [];
      for (const item of items) {
        const s = item.assignment.status;
        if (s === "assigned" || s === "in_progress") {
          active.push(item);
          continue;
        }
        if ((s === "submitted" || s === "approved") && item.assignment.completed_at) {
          const completedAt = new Date(item.assignment.completed_at).getTime();
          if (now - completedAt <= COMPLETED_VISIBLE_MS) recent.push(item);
        }
      }
      active.sort((a, b) => {
        const ad = a.task.due_date ? new Date(a.task.due_date).getTime() : Infinity;
        const bd = b.task.due_date ? new Date(b.task.due_date).getTime() : Infinity;
        if (ad !== bd) return ad - bd;
        return priOrder[a.task.priority] - priOrder[b.task.priority];
      });
      recent.sort((a, b) => {
        const at = a.assignment.completed_at ? new Date(a.assignment.completed_at).getTime() : 0;
        const bt = b.assignment.completed_at ? new Date(b.assignment.completed_at).getTime() : 0;
        return bt - at;
      });
      return { activeRows: active, completedRecently: recent, filteredFlat: [] as MyTaskItem[] };
    }

    // Other tabs: flat list, most recently completed first.
    const list = items.filter((item) => {
      const s = item.assignment.status;
      if (tab === "submitted") return s === "submitted";
      return s === "approved";
    });
    list.sort((a, b) => {
      const at = a.assignment.completed_at ? new Date(a.assignment.completed_at).getTime() : 0;
      const bt = b.assignment.completed_at ? new Date(b.assignment.completed_at).getTime() : 0;
      return bt - at;
    });
    return {
      activeRows: [] as MyTaskItem[],
      completedRecently: [] as MyTaskItem[],
      filteredFlat: list,
    };
  }, [items, tab]);

  const isCompletedExpanded =
    completedExpanded ?? completedRecently.length <= COMPLETED_AUTO_COLLAPSE;

  function handleStatusChange(itemId: string, nextStatus: TaskStatus) {
    const target = items.find((i) => i.assignment.id === itemId);
    if (!target) return;

    triggerHaptic(nextStatus === "submitted" ? "success" : "tick");

    // For "submitted", auto-approve tasks skip the review step locally too,
    // matching what the server will do.
    const autoApprove =
      nextStatus === "submitted" && !target.task.requires_approval;
    const effectiveStatus: TaskStatus = autoApprove ? "approved" : nextStatus;

    // Optimistic update
    setItems((prev) =>
      prev.map((i) =>
        i.assignment.id === itemId
          ? {
              ...i,
              assignment: {
                ...i.assignment,
                status: effectiveStatus,
                completed_at:
                  effectiveStatus === "submitted" ||
                  effectiveStatus === "approved"
                    ? new Date().toISOString()
                    : null,
                approved_at:
                  effectiveStatus === "approved"
                    ? new Date().toISOString()
                    : null,
              },
            }
          : i
      )
    );

    if (nextStatus === "submitted") {
      // Toast + check the special "last task of the day" moment
      const remainingActive = items.filter(
        (i) =>
          i.assignment.id !== itemId &&
          (i.assignment.status === "assigned" ||
            i.assignment.status === "in_progress")
      ).length;
      if (remainingActive === 0) {
        toast.success("Inbox zero! Nice work.", {
          description: "All tasks knocked out.",
          icon: <Sparkles className="h-4 w-4" />,
        });
      } else if (autoApprove) {
        toast.success("Done", { description: target.task.title });
      } else {
        toast.success("Submitted for review", {
          description: target.task.title,
        });
      }
    } else if (nextStatus === "in_progress") {
      toast("Marked in progress", { description: target.task.title });
    } else if (nextStatus === "assigned") {
      toast("Reopened", { description: target.task.title });
    }

    startTransition(async () => {
      const result = await setAssignmentStatus(itemId, nextStatus);
      if (result?.error) {
        toast.error("Couldn't save change", {
          description: typeof result.error === "string" ? result.error : "Try again.",
        });
        // Revert
        setItems((prev) =>
          prev.map((i) =>
            i.assignment.id === itemId ? target : i
          )
        );
      }
    });
  }

  const openItem = openTaskId
    ? items.find((i) => i.task.id === openTaskId) ?? null
    : null;

  return (
    <div className="space-y-4">
      {/* Streak / counter strip */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {counts.doneToday} done today
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
          <ListTodo className="h-3.5 w-3.5" />
          {counts.active} active
        </span>
        {counts.submitted > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-amber-700 dark:text-amber-300">
            {counts.submitted} awaiting review
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b">
        {(
          [
            ["active", "Active", counts.active],
            ["submitted", "Submitted", counts.submitted],
            ["approved", "Approved", counts.approved],
          ] as const
        ).map(([id, label, count]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`relative -mb-px inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
              tab === id
                ? "border-b-2 border-primary text-foreground"
                : "border-b-2 border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
            <span
              className={`rounded-full px-1.5 text-[10px] ${
                tab === id ? "bg-primary/15 text-primary" : "bg-muted"
              }`}
            >
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* Task list */}
      {tab === "active" ? (
        activeRows.length === 0 && completedRecently.length === 0 ? (
          <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
            All clear — nothing assigned right now.
          </div>
        ) : (
          <div className="space-y-5">
            {activeRows.length > 0 ? (
              <ul className="space-y-2">
                {activeRows.map((item) => (
                  <TaskCard
                    key={item.assignment.id}
                    item={item}
                    onStatusChange={handleStatusChange}
                    onOpen={() => setOpenTaskId(item.task.id)}
                  />
                ))}
              </ul>
            ) : (
              <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
                Nothing left to do today. Look at this pile though ↓
              </div>
            )}

            {completedRecently.length > 0 && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setCompletedExpanded(!isCompletedExpanded)}
                  className="flex w-full items-center gap-2 border-t pt-3 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  {isCompletedExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  <span>
                    {completedRecently.length} completed in the last 24 hours
                  </span>
                  <span className="ml-auto text-[10px] text-muted-foreground/70">
                    {isCompletedExpanded ? "Hide" : "Show"}
                  </span>
                </button>
                <ul
                  className={cn(
                    "space-y-2 transition-all",
                    !isCompletedExpanded && "hidden"
                  )}
                >
                  {completedRecently.map((item) => (
                    <TaskCard
                      key={item.assignment.id}
                      item={item}
                      onStatusChange={handleStatusChange}
                      onOpen={() => setOpenTaskId(item.task.id)}
                    />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )
      ) : filteredFlat.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
          {tab === "submitted"
            ? "Nothing waiting on review."
            : "No approved tasks yet."}
        </div>
      ) : (
        <ul className="space-y-2">
          {filteredFlat.map((item) => (
            <TaskCard
              key={item.assignment.id}
              item={item}
              onStatusChange={handleStatusChange}
              onOpen={() => setOpenTaskId(item.task.id)}
            />
          ))}
        </ul>
      )}

      <TaskDetailDialog
        item={openItem}
        open={openTaskId !== null}
        onClose={() => setOpenTaskId(null)}
        onStatusChange={handleStatusChange}
      />
    </div>
  );
}
