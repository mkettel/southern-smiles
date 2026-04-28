"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import type { Profile, Task, TaskPriority } from "@/lib/types";
import { createTask, getAllTasks, updateTask } from "@/actions/tasks";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Profile[];
  /** Current user's profile id — pinned to the top of the picker as "Me". */
  viewerId?: string;
  /** When set, dialog acts as edit form. */
  editing?: Task;
  onCreated?: (task: Task) => void;
  onUpdated?: (task: Task) => void;
}

export function CreateTaskDialog({
  open,
  onOpenChange,
  members,
  viewerId,
  editing,
  onCreated,
  onUpdated,
}: CreateTaskDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [isSubmitting, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setDescription(editing.description ?? "");
      setDueDate(editing.due_date ?? "");
      setPriority(editing.priority);
      setAssigneeIds((editing.assignments ?? []).map((a) => a.profile_id));
    } else {
      setTitle("");
      setDescription("");
      setDueDate("");
      setPriority("normal");
      setAssigneeIds([]);
    }
  }, [open, editing]);

  function toggleAssignee(id: string) {
    setAssigneeIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  function handleSubmit() {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (assigneeIds.length === 0) {
      toast.error("Pick at least one assignee");
      return;
    }
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      due_date: dueDate || null,
      priority,
      assignee_ids: assigneeIds,
    };
    startTransition(async () => {
      const result = editing
        ? await updateTask(editing.id, payload)
        : await createTask(payload);
      if (result?.error) {
        toast.error(
          typeof result.error === "string"
            ? result.error
            : "Couldn't save task"
        );
        return;
      }
      // Reload all tasks to get the assignments + creator joined
      const fresh = await getAllTasks();
      if (editing) {
        const updated = fresh.find((t) => t.id === editing.id);
        if (updated) onUpdated?.(updated);
        toast.success("Task updated");
      } else {
        const created = fresh[0];
        if (created) onCreated?.(created);
        toast.success("Task created");
      }
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit task" : "New task"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="task-title" className="text-xs">
              Title
            </Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to happen?"
              autoFocus
            />
          </div>

          <div>
            <Label htmlFor="task-desc" className="text-xs">
              Details (optional)
            </Label>
            <Textarea
              id="task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Any context or steps…"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="task-due" className="text-xs">
                Due date
              </Label>
              <Input
                id="task-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Priority</Label>
              <Select
                value={priority}
                onValueChange={(v) => v && setPriority(v as TaskPriority)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs">
              Assign to{" "}
              {assigneeIds.length > 0 && (
                <span className="text-muted-foreground">({assigneeIds.length})</span>
              )}
            </Label>
            <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border">
              {(() => {
                const me = viewerId
                  ? members.find((m) => m.id === viewerId)
                  : undefined;
                const others = members.filter((m) => m.id !== viewerId);
                const ordered: Array<{ member: Profile; label: string }> = [];
                if (me) ordered.push({ member: me, label: "Me" });
                for (const m of others) ordered.push({ member: m, label: m.full_name });
                return ordered.map(({ member: m, label }, idx) => {
                  const checked = assigneeIds.includes(m.id);
                  const showDivider = me && idx === 1;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleAssignee(m.id)}
                      className={cn(
                        "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                        showDivider && "border-t",
                        checked && "bg-primary/5"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors",
                          checked
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/40"
                        )}
                      >
                        {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                      </span>
                      <span
                        className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-medium text-white"
                        style={{ backgroundColor: m.avatar_color ?? "#6b7280" }}
                      >
                        {(m.full_name ?? "?")
                          .split(" ")
                          .map((n) => n[0] ?? "")
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </span>
                      <span className="flex-1">{label}</span>
                      {label === "Me" && (
                        <span className="text-[10px] text-muted-foreground">
                          {m.full_name}
                        </span>
                      )}
                    </button>
                  );
                });
              })()}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : editing ? "Save changes" : "Create task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
