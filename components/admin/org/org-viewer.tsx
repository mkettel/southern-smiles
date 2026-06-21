"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { LayoutGrid, ListTree, Pencil, PencilOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { TreeView } from "./tree-view";
import { BoardView } from "./board-view";
import { useOrgEditing } from "./use-org-editing";
import type { OrgViewerProps } from "./types";

type ViewMode = "tree" | "board";
const VIEW_STORAGE_KEY = "org-view-mode";

export function OrgViewer({ isAdmin, ...data }: OrgViewerProps) {
  const [view, setView] = useState<ViewMode>("board");
  const [isEditing, setIsEditing] = useState(false);
  const editing = useOrgEditing();

  // Drop optimistic reorder overrides once the server-revalidated props
  // reflect the same order — prevents a flip back to stale display_order.
  useEffect(() => {
    editing.pruneStaleOverrides(data.departments);
    // Intentionally only depend on departments — pruneStaleOverrides is stable enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.departments]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_STORAGE_KEY) as ViewMode | null;
      if (saved === "tree" || saved === "board") setView(saved);
    } catch {
      // ignore
    }
  }, []);

  function selectView(next: ViewMode) {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // ignore
    }
    // Clear any open inline forms when switching views so they don't leak.
    editing.resetAll();
  }

  function toggleEditing() {
    if (isEditing) {
      editing.resetAll();
    }
    setIsEditing(!isEditing);
  }

  return (
    <div className={cn("space-y-2", view === "tree" && "max-w-4xl mx-auto")}>
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex min-w-0 items-baseline gap-2">
            <h1 className="shrink-0 text-lg font-semibold leading-none">Org Board</h1>
            <p className="hidden truncate text-xs text-muted-foreground lg:block">
              Divisions, departments, sections, and responsibilities
            </p>
          </div>

          <div className="inline-flex shrink-0 rounded-md border bg-muted/30 p-0.5">
            <ViewButton
              active={view === "tree"}
              onClick={() => selectView("tree")}
              icon={<ListTree className="h-3.5 w-3.5" />}
              label="Tree"
            />
            <ViewButton
              active={view === "board"}
              onClick={() => selectView("board")}
              icon={<LayoutGrid className="h-3.5 w-3.5" />}
              label="Board"
            />
          </div>
        </div>

        {isAdmin && (
          <Button
            variant={isEditing ? "default" : "outline"}
            size="sm"
            onClick={toggleEditing}
            className="gap-1.5"
          >
            {isEditing ? <PencilOff className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
            {isEditing ? "Done" : "Edit"}
          </Button>
        )}
      </div>

      {view === "tree" ? (
        <TreeView {...data} isEditing={isAdmin && isEditing} editing={editing} />
      ) : (
        <BoardView {...data} isEditing={isAdmin && isEditing} editing={editing} />
      )}
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors",
        active
          ? "bg-background shadow-sm text-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
