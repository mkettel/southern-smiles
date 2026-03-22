"use client";

import { useState, useTransition, useMemo } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  toggleRequest,
  deleteRequest,
  type AppRequest,
  type RequestType,
} from "@/actions/requests";
import { format } from "date-fns";
import { Trash2, CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

interface RequestListProps {
  requests: AppRequest[];
}

const TYPE_CONFIG: Record<RequestType, { label: string; className: string }> = {
  bug: { label: "Bug", className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" },
  feature: { label: "Feature", className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400" },
  improvement: { label: "Improvement", className: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400" },
};

const PRIORITY_CONFIG: Record<string, { label: string; className: string }> = {
  high: { label: "High", className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" },
  medium: { label: "Medium", className: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" },
  low: { label: "Low", className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
};

export function RequestList({ requests }: RequestListProps) {
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("open");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return requests.filter((r) => {
      if (filterType !== "all" && r.type !== filterType) return false;
      if (filterStatus === "open" && r.is_completed) return false;
      if (filterStatus === "completed" && !r.is_completed) return false;
      return true;
    });
  }, [requests, filterType, filterStatus]);

  const openCount = requests.filter((r) => !r.is_completed).length;
  const completedCount = requests.filter((r) => r.is_completed).length;

  async function handleToggle(id: string) {
    setPendingId(id);
    const result = await toggleRequest(id);
    if (result.error) {
      toast.error(typeof result.error === "string" ? result.error : "Failed");
    }
    setPendingId(null);
  }

  async function handleDelete(id: string) {
    setPendingId(id);
    const result = await deleteRequest(id);
    if (result.error) {
      toast.error(typeof result.error === "string" ? result.error : "Failed");
    } else {
      toast.success("Request deleted");
    }
    setPendingId(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Status:</span>
          <Select value={filterStatus} onValueChange={(v) => v && setFilterStatus(v)}>
            <SelectTrigger className="w-[140px] h-8 text-sm">
              <span>
                {filterStatus === "all"
                  ? "All"
                  : filterStatus === "open"
                    ? `Open (${openCount})`
                    : `Done (${completedCount})`}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ({requests.length})</SelectItem>
              <SelectItem value="open">Open ({openCount})</SelectItem>
              <SelectItem value="completed">Completed ({completedCount})</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Type:</span>
          <Select value={filterType} onValueChange={(v) => v && setFilterType(v)}>
            <SelectTrigger className="w-[150px] h-8 text-sm">
              <span>
                {filterType === "all" ? "All types" : TYPE_CONFIG[filterType as RequestType]?.label}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="bug">Bugs</SelectItem>
              <SelectItem value="feature">Features</SelectItem>
              <SelectItem value="improvement">Improvements</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-center py-8 text-muted-foreground">
          {filterStatus === "open"
            ? "No open requests. Nice!"
            : "No requests match the current filters."}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((req) => (
            <div
              key={req.id}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-4 transition-colors",
                req.is_completed && "opacity-60"
              )}
            >
              <button
                onClick={() => handleToggle(req.id)}
                disabled={pendingId === req.id}
                className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary transition-colors"
              >
                {req.is_completed ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <Circle className="h-5 w-5" />
                )}
              </button>

              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "font-medium",
                    req.is_completed && "line-through text-muted-foreground"
                  )}
                >
                  {req.title}
                </p>
                {req.description && (
                  <p
                    className={cn(
                      "text-sm text-muted-foreground mt-1",
                      req.is_completed && "line-through"
                    )}
                  >
                    {req.description}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <Badge
                    variant="secondary"
                    className={cn("text-xs border-0", TYPE_CONFIG[req.type].className)}
                  >
                    {TYPE_CONFIG[req.type].label}
                  </Badge>
                  <Badge
                    variant="secondary"
                    className={cn("text-xs border-0", PRIORITY_CONFIG[req.priority].className)}
                  >
                    {PRIORITY_CONFIG[req.priority].label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Added {format(new Date(req.created_at), "MMM d, yyyy")}
                    {req.profile?.full_name && ` by ${req.profile.full_name}`}
                  </span>
                  {req.is_completed && req.completed_at && (
                    <span className="text-xs text-green-600">
                      Completed {format(new Date(req.completed_at), "MMM d, yyyy")}
                    </span>
                  )}
                </div>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(req.id)}
                disabled={pendingId === req.id}
                className="shrink-0 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
