"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { MiniStatCard } from "./mini-stat-card";
import { reorderStats } from "@/actions/admin";
import { cn } from "@/lib/utils";
import type { DashboardStat, Division } from "@/lib/types";

interface WallViewProps {
  stats: DashboardStat[];
  isAdmin?: boolean;
}

type Column = { division: Division | null; stats: DashboardStat[] };

/**
 * Dense column-grouped view — one column per division, stats stacked
 * vertically inside. Admins can drag to reorder within a division.
 */
export function WallView({ stats, isAdmin = false }: WallViewProps) {
  const serverColumns = useMemo(() => buildColumns(stats), [stats]);
  const [columns, setColumns] = useState<Column[]>(serverColumns);

  // Resync when the server pushes new data (e.g. week change, new entry).
  useEffect(() => {
    setColumns(serverColumns);
  }, [serverColumns]);

  return (
    <div
      className="grid gap-3"
      style={{
        gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`,
      }}
    >
      {columns.map((col, i) => (
        <DivisionColumn
          key={col.division?.id ?? `none-${i}`}
          column={col}
          isAdmin={isAdmin}
          onReorder={(orderedIds) => {
            setColumns((prev) =>
              prev.map((c) =>
                c === col || c.division?.id === col.division?.id
                  ? {
                      ...c,
                      stats: orderedIds
                        .map((id) => c.stats.find((s) => s.stat.id === id))
                        .filter((s): s is DashboardStat => !!s),
                    }
                  : c
              )
            );
          }}
        />
      ))}
    </div>
  );
}

function buildColumns(stats: DashboardStat[]): Column[] {
  const byDiv = new Map<string, Column>();
  for (const s of stats) {
    const key = s.division?.id ?? "__none";
    if (!byDiv.has(key)) {
      byDiv.set(key, { division: s.division ?? null, stats: [] });
    }
    byDiv.get(key)!.stats.push(s);
  }
  for (const col of byDiv.values()) {
    col.stats.sort((a, b) => a.stat.display_order - b.stat.display_order);
  }
  return Array.from(byDiv.values()).sort(
    (a, b) => (a.division?.number ?? 99) - (b.division?.number ?? 99)
  );
}

function DivisionColumn({
  column,
  isAdmin,
  onReorder,
}: {
  column: Column;
  isAdmin: boolean;
  onReorder: (orderedIds: string[]) => void;
}) {
  const [, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const color = column.division?.color || "#6b7280";
  const ids = column.stats.map((s) => s.stat.id);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    const nextIds = arrayMove(ids, oldIndex, newIndex);
    onReorder(nextIds);
    startTransition(async () => {
      await reorderStats(nextIds);
    });
  }

  const list = (
    <div className="flex flex-col gap-2">
      {column.stats.map((data) =>
        isAdmin ? (
          <SortableMiniCard key={data.stat.id} data={data} isAdmin />
        ) : (
          <MiniStatCard key={data.stat.id} data={data} isAdmin={isAdmin} />
        )
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-1">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: color }}
        />
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
          {column.division ? `${column.division.name}` : "Other"}
        </h2>
        {column.division && (
          <span className="text-[10px] text-muted-foreground/70 tabular-nums">
            {column.division.number}
          </span>
        )}
      </div>
      {isAdmin ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            {list}
          </SortableContext>
        </DndContext>
      ) : (
        list
      )}
    </div>
  );
}

function SortableMiniCard({
  data,
  isAdmin,
}: {
  data: DashboardStat;
  isAdmin: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: data.stat.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative group/drag",
        isDragging && "z-10 opacity-70"
      )}
    >
      <button
        type="button"
        aria-label="Drag to reorder"
        className="absolute left-0.5 top-1/2 -translate-y-1/2 z-10 flex h-6 w-5 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/40 opacity-0 transition-opacity hover:text-muted-foreground group-hover/drag:opacity-100 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <MiniStatCard data={data} isAdmin={isAdmin} />
    </div>
  );
}
