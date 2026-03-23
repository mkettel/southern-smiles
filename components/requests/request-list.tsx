"use client";

import { useState, useMemo } from "react";
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
  updateRequestStatus,
  deleteRequest,
  type AppRequest,
  type RequestType,
  type RequestStatus,
} from "@/actions/requests";
import { format, differenceInDays } from "date-fns";
import { Trash2, MessageCircle, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { RequestThread } from "./request-thread";

interface RequestListProps {
  requests: (AppRequest & { comment_count: number })[];
  lastSeenAt?: string | null;
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

const STATUS_CONFIG: Record<RequestStatus, { label: string; dotColor: string }> = {
  open: { label: "Open", dotColor: "bg-gray-400" },
  in_progress: { label: "In Progress", dotColor: "bg-blue-500" },
  in_review: { label: "In Review", dotColor: "bg-amber-500" },
  completed: { label: "Completed", dotColor: "bg-green-500" },
};

const STATUS_ORDER: RequestStatus[] = ["in_review", "in_progress", "open", "completed"];

function StatusDot({ status }: { status: RequestStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <span className="relative group/dot cursor-default">
      <span className={cn("inline-block w-2 h-2 rounded-full", config.dotColor)} />
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-0.5 rounded text-[10px] font-medium bg-foreground text-background whitespace-nowrap opacity-0 group-hover/dot:opacity-100 transition-opacity pointer-events-none z-10">
        {config.label}
      </span>
    </span>
  );
}

export function RequestList({ requests, lastSeenAt }: RequestListProps) {
  const [filterType, setFilterType] = useState<string>("all");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [expandedThread, setExpandedThread] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const now = new Date();

  const typeFiltered = useMemo(() => {
    return filterType === "all"
      ? requests
      : requests.filter((r) => r.type === filterType);
  }, [requests, filterType]);

  // Split into status groups + archived
  const { groups, archived } = useMemo(() => {
    const groups: Record<RequestStatus, (AppRequest & { comment_count: number })[]> = {
      open: [],
      in_progress: [],
      in_review: [],
      completed: [],
    };
    const archived: (AppRequest & { comment_count: number })[] = [];

    for (const r of typeFiltered) {
      if (
        r.status === "completed" &&
        r.completed_at &&
        differenceInDays(now, new Date(r.completed_at)) > 30
      ) {
        archived.push(r);
      } else {
        groups[r.status].push(r);
      }
    }

    // Sort each group by created_at desc
    for (const key of STATUS_ORDER) {
      groups[key].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }

    archived.sort(
      (a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime()
    );

    return { groups, archived };
  }, [typeFiltered, now]);

  const activeGroups = STATUS_ORDER.filter((s) => groups[s].length > 0);

  async function handleStatusChange(id: string, status: RequestStatus) {
    setPendingId(id);
    const result = await updateRequestStatus(id, status);
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

  function renderRequest(req: AppRequest & { comment_count: number }) {
    const isCompleted = req.status === "completed";
    const isNew = lastSeenAt
      ? new Date(req.updated_at) > new Date(lastSeenAt)
      : false;

    return (
      <div
        key={req.id}
        className={cn(
          "flex items-start gap-3 py-3",
          isCompleted && "opacity-50"
        )}
      >
        {/* Status dot with dropdown */}
        <Select
          value={req.status}
          onValueChange={(v) =>
            v && handleStatusChange(req.id, v as RequestStatus)
          }
        >
          <SelectTrigger
            className="w-auto h-auto p-0 border-0 bg-transparent shadow-none mt-1.5 shrink-0"
            disabled={pendingId === req.id}
          >
            <StatusDot status={req.status} />
          </SelectTrigger>
          <SelectContent>
            {STATUS_ORDER.map((value) => (
              <SelectItem key={value} value={value}>
                <span className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "inline-block w-2 h-2 rounded-full",
                      STATUS_CONFIG[value].dotColor
                    )}
                  />
                  {STATUS_CONFIG[value].label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p
              className={cn(
                "text-sm font-medium",
                isCompleted && "line-through text-muted-foreground"
              )}
            >
              {req.title}
            </p>
            {isNew && (
              <span className="relative group/new shrink-0">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500" />
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-0.5 rounded text-[10px] font-medium bg-foreground text-background whitespace-nowrap opacity-0 group-hover/new:opacity-100 transition-opacity pointer-events-none z-10">
                  New activity
                </span>
              </span>
            )}
          </div>
          {req.description && (
            <p
              className={cn(
                "text-xs text-muted-foreground mt-0.5",
                isCompleted && "line-through"
              )}
            >
              {req.description}
            </p>
          )}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <Badge
              variant="secondary"
              className={cn("text-[10px] px-1.5 py-0 border-0", TYPE_CONFIG[req.type].className)}
            >
              {TYPE_CONFIG[req.type].label}
            </Badge>
            <Badge
              variant="secondary"
              className={cn("text-[10px] px-1.5 py-0 border-0", PRIORITY_CONFIG[req.priority].className)}
            >
              {PRIORITY_CONFIG[req.priority].label}
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              {format(new Date(req.created_at), "MMM d")}
              {req.profile?.full_name && ` · ${req.profile.full_name}`}
            </span>
            {isCompleted && req.completed_at && (
              <span className="text-[10px] text-green-600">
                Done {format(new Date(req.completed_at), "MMM d")}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() =>
              setExpandedThread(expandedThread === req.id ? null : req.id)
            }
            className={cn(
              "inline-flex items-center gap-0.5 rounded p-1 text-xs transition-colors",
              expandedThread === req.id
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <MessageCircle className="h-3 w-3" />
            {req.comment_count > 0 && (
              <span className="text-[10px]">{req.comment_count}</span>
            )}
          </button>
          <button
            onClick={() => handleDelete(req.id)}
            disabled={pendingId === req.id}
            className="rounded p-1 text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  }

  const totalActive = STATUS_ORDER.reduce((sum, s) => sum + groups[s].length, 0);

  return (
    <div className="space-y-2">
      {/* Type filter */}
      <div className="flex items-center gap-1.5">
        {(["all", "bug", "feature", "improvement"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
              filterType === t
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            {t === "all" ? "All" : TYPE_CONFIG[t].label}
          </button>
        ))}
      </div>

      {totalActive === 0 && archived.length === 0 ? (
        <p className="text-center py-8 text-muted-foreground text-sm">
          No requests yet.
        </p>
      ) : (
        <>
          {/* Status sections */}
          {activeGroups.map((status) => (
            <div key={status}>
              <div className="flex items-center gap-2 py-2">
                <span
                  className={cn(
                    "inline-block w-1.5 h-1.5 rounded-full",
                    STATUS_CONFIG[status].dotColor
                  )}
                />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {STATUS_CONFIG[status].label}
                </span>
                <span className="text-[11px] text-muted-foreground/50">
                  {groups[status].length}
                </span>
                <div className="flex-1 border-t border-border/50" />
              </div>
              <div className="divide-y divide-border/50">
                {groups[status].map((req) => (
                  <div key={req.id}>
                    {renderRequest(req)}
                    {expandedThread === req.id && (
                      <div className="pb-3">
                        <RequestThread
                          requestId={req.id}
                          commentCount={req.comment_count}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Archived */}
          {archived.length > 0 && (
            <div className="pt-2">
              <button
                onClick={() => setShowArchived(!showArchived)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-2"
              >
                {showArchived ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                Archived · {archived.length} completed 30+ days ago
              </button>
              {showArchived && (
                <div className="divide-y divide-border/50">
                  {archived.map((req) => (
                    <div key={req.id}>
                      {renderRequest(req)}
                      {expandedThread === req.id && (
                        <div className="pb-3">
                          <RequestThread
                            requestId={req.id}
                            commentCount={req.comment_count}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
