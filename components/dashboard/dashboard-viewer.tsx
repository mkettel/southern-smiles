"use client";

import { useEffect, useState } from "react";
import { LayoutList, LayoutGrid, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatCard } from "./stat-card";
import { WallView } from "./wall-view";
import { CanvasView } from "./canvas-view";
import type { DashboardStat } from "@/lib/types";

type ViewMode = "grouped" | "wall" | "canvas";
const VIEW_STORAGE_KEY = "dashboard-view-mode";

interface DashboardViewerProps {
  stats: DashboardStat[];
  isAdmin?: boolean;
}

export function DashboardViewer({ stats, isAdmin = false }: DashboardViewerProps) {
  const [view, setView] = useState<ViewMode>("grouped");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_STORAGE_KEY) as
        | ViewMode
        | null;
      if (saved === "grouped" || saved === "wall" || saved === "canvas") {
        setView(saved);
      }
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
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <div className="inline-flex rounded-md border bg-muted/30 p-0.5">
          <ViewButton
            active={view === "grouped"}
            onClick={() => selectView("grouped")}
            icon={<LayoutList className="h-3.5 w-3.5" />}
            label="Grouped"
          />
          <ViewButton
            active={view === "wall"}
            onClick={() => selectView("wall")}
            icon={<LayoutGrid className="h-3.5 w-3.5" />}
            label="Wall"
          />
          <ViewButton
            active={view === "canvas"}
            onClick={() => selectView("canvas")}
            icon={<Maximize2 className="h-3.5 w-3.5" />}
            label="Canvas"
          />
        </div>
      </div>

      {view === "grouped" && <GroupedView stats={stats} isAdmin={isAdmin} />}
      {view === "wall" && <WallView stats={stats} isAdmin={isAdmin} />}
      {view === "canvas" && <CanvasView stats={stats} isAdmin={isAdmin} />}
    </div>
  );
}

function GroupedView({ stats, isAdmin }: { stats: DashboardStat[]; isAdmin: boolean }) {
  const grouped = new Map<
    string,
    { label: string; number: number; stats: DashboardStat[] }
  >();
  for (const statData of stats) {
    const div = statData.division;
    const key = div?.id ?? "unknown";
    const label = div ? `Div ${div.number} – ${div.name}` : "Other";
    const num = div?.number ?? 99;
    if (!grouped.has(key)) {
      grouped.set(key, { label, number: num, stats: [] });
    }
    grouped.get(key)!.stats.push(statData);
  }
  const sortedGroups = Array.from(grouped.values()).sort(
    (a, b) => a.number - b.number
  );

  return (
    <div className="space-y-8">
      {sortedGroups.map((group) => (
        <div key={group.label}>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {group.label}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.stats.map((statData) => (
              <StatCard key={statData.stat.id} data={statData} isAdmin={isAdmin} />
            ))}
          </div>
        </div>
      ))}
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
