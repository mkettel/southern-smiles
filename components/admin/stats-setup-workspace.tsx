"use client";

import { useMemo, useState } from "react";
import { Pencil, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatFormDialog } from "@/components/admin/stat-form-dialog";
import { StatFormulaControl } from "@/components/admin/stat-formula-control";
import { StatToggleButton } from "@/components/admin/stat-toggle-button";
import { PrivacyToggleButton } from "@/components/admin/privacy-toggle-button";
import { StatName } from "@/components/stats/stat-name";
import { cn } from "@/lib/utils";
import type { Post, Stat } from "@/lib/types";

type StatusFilter = "all" | "active" | "inactive";

interface DivisionGroup {
  key: string;
  label: string;
  number: number;
  color: string;
  stats: Stat[];
}

interface StatsSetupWorkspaceProps {
  stats: Stat[];
  posts: Post[];
}

const TYPE_LABELS = {
  count: "Count",
  dollar: "Dollar",
  percentage: "Percentage",
} as const;

function divisionKey(stat: Stat) {
  return stat.post?.division?.id ?? "unassigned";
}

function divisionNumber(stat: Stat) {
  return stat.post?.division?.number ?? 999;
}

function sortStats(stats: Stat[]) {
  return [...stats].sort((a, b) => {
    const divisionCompare = divisionNumber(a) - divisionNumber(b);
    if (divisionCompare !== 0) return divisionCompare;
    const postCompare = (a.post?.title ?? "").localeCompare(b.post?.title ?? "");
    if (postCompare !== 0) return postCompare;
    return a.display_order - b.display_order || a.name.localeCompare(b.name);
  });
}

function groupByDivision(stats: Stat[]) {
  const groups = new Map<string, DivisionGroup>();

  for (const stat of sortStats(stats)) {
    const division = stat.post?.division;
    const key = divisionKey(stat);
    const group = groups.get(key) ?? {
      key,
      label: division ? `Division ${division.number} ${division.name}` : "Unassigned",
      number: division?.number ?? 999,
      color: division?.color || "#6b7280",
      stats: [],
    };
    group.stats.push(stat);
    groups.set(key, group);
  }

  return [...groups.values()].sort((a, b) => a.number - b.number);
}

function groupByPost(stats: Stat[]) {
  const groups = new Map<string, { title: string; stats: Stat[] }>();
  for (const stat of stats) {
    const key = stat.post?.id ?? "unassigned";
    const group = groups.get(key) ?? {
      title: stat.post?.title ?? "No post assigned",
      stats: [],
    };
    group.stats.push(stat);
    groups.set(key, group);
  }
  return [...groups.entries()];
}

export function StatsSetupWorkspace({ stats, posts }: StatsSetupWorkspaceProps) {
  const [search, setSearch] = useState("");
  const [divisionFilter, setDivisionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const divisionOptions = useMemo(() => groupByDivision(stats), [stats]);
  const activeCount = stats.filter((stat) => stat.is_active).length;

  const visibleStats = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return stats.filter((stat) => {
      if (divisionFilter !== "all" && divisionKey(stat) !== divisionFilter) return false;
      if (statusFilter === "active" && !stat.is_active) return false;
      if (statusFilter === "inactive" && stat.is_active) return false;

      if (!normalizedSearch) return true;
      const division = stat.post?.division;
      return [
        stat.name,
        stat.abbreviation,
        stat.post?.title,
        division?.name,
        division ? `division ${division.number}` : null,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [divisionFilter, search, stats, statusFilter]);

  const groupedStats = useMemo(() => groupByDivision(visibleStats), [visibleStats]);

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-md border bg-card/40 p-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search stat or post..."
              className="pl-8"
              aria-label="Search stats setup"
            />
          </div>

          <div className="inline-flex w-fit rounded-md border bg-muted/30 p-0.5" role="group" aria-label="Status filter">
            {(["all", "active", "inactive"] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                aria-pressed={statusFilter === status}
                className={cn(
                  "rounded px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                  statusFilter === status
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          <Button
            type="button"
            variant={divisionFilter === "all" ? "default" : "outline"}
            size="sm"
            aria-pressed={divisionFilter === "all"}
            onClick={() => setDivisionFilter("all")}
          >
            All
            <span className="text-xs opacity-70">{stats.length}</span>
          </Button>
          {divisionOptions.map((division) => (
            <Button
              key={division.key}
              type="button"
              variant={divisionFilter === division.key ? "default" : "outline"}
              size="sm"
              aria-pressed={divisionFilter === division.key}
              onClick={() => setDivisionFilter(division.key)}
              className="gap-1.5"
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: division.color }} />
              <span>{division.number === 999 ? "Unassigned" : `Div ${division.number}`}</span>
              <span className="text-xs opacity-70">{division.stats.length}</span>
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span>{visibleStats.length} shown</span>
        <span aria-hidden>·</span>
        <span>{activeCount} active overall</span>
      </div>

      {groupedStats.length === 0 ? (
        <div className="rounded-md border py-10 text-center text-sm text-muted-foreground">
          No stats match the current filters.
        </div>
      ) : (
        groupedStats.map((division) => (
          <section key={division.key} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: division.color }} />
              <h2 className="text-sm font-semibold">{division.label}</h2>
              <span className="text-xs text-muted-foreground">{division.stats.length} stats</span>
            </div>

            <div className="overflow-hidden rounded-md border bg-background">
              {groupByPost(division.stats).map(([postId, postGroup], postIndex) => (
                <div key={postId} className={cn(postIndex > 0 && "border-t-2 border-muted")}>
                  <div className="flex items-center justify-between gap-3 bg-muted/35 px-3 py-2">
                    <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                      {postGroup.title}
                    </h3>
                    <span className="text-xs text-muted-foreground">{postGroup.stats.length}</span>
                  </div>

                  {postGroup.stats.map((stat, statIndex) => (
                    <div
                      key={stat.id}
                      className={cn(
                        "grid gap-3 px-3 py-3 lg:grid-cols-[minmax(220px,1.4fr)_minmax(180px,0.8fr)_minmax(190px,0.9fr)_auto] lg:items-center",
                        statIndex > 0 && "border-t",
                        !stat.is_active && "bg-muted/20 opacity-60",
                      )}
                    >
                      <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <div className="min-w-0 font-medium">
                            <StatName name={stat.name} description={stat.description} />
                          </div>
                          {stat.abbreviation && (
                            <span className="text-xs text-muted-foreground">({stat.abbreviation})</span>
                          )}
                        </div>
                        {stat.description && (
                          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{stat.description}</p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline">{TYPE_LABELS[stat.stat_type]}</Badge>
                        <Badge variant={stat.good_direction === "up" ? "default" : "secondary"}>
                          {stat.good_direction === "up" ? "Higher" : "Lower"}
                        </Badge>
                        <Badge variant={stat.is_active ? "outline" : "secondary"}>
                          {stat.is_active ? "Active" : "Inactive"}
                        </Badge>
                        {stat.is_private && <Badge variant="secondary">Admin only</Badge>}
                      </div>

                      <div>
                        <p className="mb-1.5 text-[11px] font-medium uppercase text-muted-foreground">
                          Weekly formula
                        </p>
                        <StatFormulaControl stat={stat} stats={stats} />
                      </div>

                      <div className="flex items-center gap-2 lg:justify-end">
                        <StatFormDialog
                          posts={posts}
                          editStat={{
                            id: stat.id,
                            name: stat.name,
                            abbreviation: stat.abbreviation,
                            description: stat.description,
                            stat_type: stat.stat_type,
                            good_direction: stat.good_direction,
                            post_id: stat.post_id,
                            display_order: stat.display_order,
                          }}
                          trigger={
                            <span className="inline-flex items-center gap-1.5">
                              <Pencil className="h-3.5 w-3.5" />
                              <span className="sr-only">Edit {stat.name}</span>
                            </span>
                          }
                        />
                        <PrivacyToggleButton
                          id={stat.id}
                          isPrivate={stat.is_private}
                          target="stat"
                          label={stat.name}
                        />
                        <StatToggleButton statId={stat.id} isActive={stat.is_active} />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
