"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { ArrowRight, Calendar, CheckSquare, ListTodo } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getMyTasks, setAssignmentStatus } from "@/actions/tasks";
import type { MyTaskItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "./haptics";

interface TasksBellProps {
  initialActiveCount: number;
}

function dueLabel(due: string | null): { label: string; tone: "overdue" | "today" | "soon" | "later" | "none" } {
  if (!due) return { label: "", tone: "none" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(due);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return { label: `${Math.abs(diff)}d late`, tone: "overdue" };
  if (diff === 0) return { label: "Today", tone: "today" };
  if (diff === 1) return { label: "Tomorrow", tone: "soon" };
  if (diff < 7) return { label: `${diff}d`, tone: "soon" };
  return {
    label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    tone: "later",
  };
}

export function TasksBell({ initialActiveCount }: TasksBellProps) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(initialActiveCount);
  const [items, setItems] = useState<MyTaskItem[] | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setCount(initialActiveCount);
  }, [initialActiveCount]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && items === null) {
      getMyTasks().then((data) => setItems(data));
    }
  }

  const active =
    items?.filter(
      (i) =>
        i.assignment.status === "assigned" || i.assignment.status === "in_progress"
    ) ?? null;

  function handleQuickComplete(item: MyTaskItem) {
    triggerHaptic("success");
    setItems((prev) =>
      prev
        ? prev.map((i) =>
            i.assignment.id === item.assignment.id
              ? {
                  ...i,
                  assignment: {
                    ...i.assignment,
                    status: "submitted",
                    completed_at: new Date().toISOString(),
                  },
                }
              : i
          )
        : prev
    );
    setCount((c) => Math.max(0, c - 1));
    toast.success("Submitted", { description: item.task.title });
    startTransition(async () => {
      const r = await setAssignmentStatus(item.assignment.id, "submitted");
      if (r?.error) {
        toast.error("Couldn't save");
        // Refresh to authoritative state
        const fresh = await getMyTasks();
        setItems(fresh);
        setCount(
          fresh.filter(
            (i) =>
              i.assignment.status === "assigned" ||
              i.assignment.status === "in_progress"
          ).length
        );
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <TooltipProvider delay={250}>
        <Tooltip>
          <TooltipTrigger
            render={
              <SheetTrigger
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors outline-none"
                aria-label="Open tasks"
              />
            }
          >
            <CheckSquare className="h-4 w-4" />
            {count > 0 && (
              <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
                {count > 9 ? "9+" : count}
              </span>
            )}
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            Tasks{count > 0 ? ` · ${count} active` : ""}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <SheetContent
        side="right"
        className="w-full data-[side=right]:sm:max-w-md flex flex-col gap-0 p-0"
      >
        <SheetHeader className="border-b">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className="flex items-center gap-2">
              <ListTodo className="h-4 w-4" />
              My Tasks
            </SheetTitle>
            <Link
              href="/tasks"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              View all
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {items === null ? (
            <div className="text-xs text-muted-foreground p-4">Loading…</div>
          ) : !active || active.length === 0 ? (
            <div className="py-12 text-center">
              <CheckSquare className="mx-auto h-8 w-8 text-emerald-500/60" />
              <p className="mt-3 text-sm font-medium">All clear</p>
              <p className="text-xs text-muted-foreground">
                Nothing on your plate right now.
              </p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {active.map((item) => {
                const due = dueLabel(item.task.due_date);
                return (
                  <li
                    key={item.assignment.id}
                    className="group/row flex items-start gap-2 rounded-lg border bg-card p-2.5 hover:border-foreground/20 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => handleQuickComplete(item)}
                      aria-label="Mark done"
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground/40 transition-all active:scale-90 hover:border-primary hover:bg-primary/10"
                    >
                      <span className="block h-2 w-2 rounded-full bg-primary opacity-0 group-hover/row:opacity-30 transition-opacity" />
                    </button>
                    <Link
                      href="/tasks"
                      onClick={() => setOpen(false)}
                      className="flex-1 min-w-0"
                    >
                      <div className="text-sm font-medium leading-snug line-clamp-2">
                        {item.task.title}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                        {due.tone !== "none" && (
                          <span
                            className={cn(
                              "inline-flex items-center gap-0.5",
                              due.tone === "overdue" && "font-medium text-red-600 dark:text-red-400",
                              due.tone === "today" && "font-medium text-amber-600 dark:text-amber-400"
                            )}
                          >
                            <Calendar className="h-2.5 w-2.5" />
                            {due.label}
                          </span>
                        )}
                        {item.assignment.status === "in_progress" && (
                          <span className="text-primary">In progress</span>
                        )}
                        {item.task.priority === "high" && (
                          <span className="text-red-600 dark:text-red-400 font-medium">High</span>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
