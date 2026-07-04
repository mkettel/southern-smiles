"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Calculator,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Copy,
  DollarSign,
  FlaskConical,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrencyFromCents, formatHours } from "@/lib/overhead";
import {
  calculateProcedureCost,
  calculateVisitTotals,
  DEFAULT_PROCEDURE_DRAFTS,
  type ProcedureDraft,
  type ProcedureMaterialDraft,
  type ProcedureMaterialKind,
  type ProcedureTreatmentFamily,
  type ProcedureVisitDraft,
} from "@/lib/procedure-cost";
import { parseDollarAmountToCents } from "@/lib/bills";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "procedure-cost-workspace-v4";

interface ProcedureCostWorkspaceProps {
  overheadPerOperatoryHourCents: number | null;
  fullCapacityOverheadRateCents: number | null;
  overheadSetupRequired: boolean;
}

type ProcedureDraftLike = Omit<ProcedureDraft, "family"> &
  Partial<Pick<ProcedureDraft, "family">>;

type ProcedureFamilyFilter = ProcedureTreatmentFamily | "all";

const PROCEDURE_FAMILY_OPTIONS: Array<{
  value: ProcedureTreatmentFamily;
  label: string;
}> = [
  { value: "restorative", label: "Restorative" },
  { value: "surgery", label: "Surgery" },
  { value: "endo", label: "Endo" },
  { value: "removable", label: "Removable" },
  { value: "other", label: "Other" },
];

const PROCEDURE_FAMILY_META: Record<
  ProcedureTreatmentFamily,
  {
    label: string;
    stripeClass: string;
    surfaceClass: string;
    badgeClass: string;
    chipActiveClass: string;
    chipIdleClass: string;
  }
> = {
  restorative: {
    label: "Restorative",
    stripeClass: "bg-sky-500",
    surfaceClass: "border-sky-200/80 bg-sky-50/60",
    badgeClass: "border-sky-200 bg-sky-50 text-sky-800",
    chipActiveClass: "border-sky-600 bg-sky-600 text-white hover:bg-sky-600",
    chipIdleClass: "border-sky-200 text-sky-800 hover:bg-sky-50",
  },
  surgery: {
    label: "Surgery",
    stripeClass: "bg-zinc-900",
    surfaceClass: "border-zinc-300/80 bg-zinc-50/80",
    badgeClass: "border-zinc-300 bg-zinc-100 text-zinc-900",
    chipActiveClass: "border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-900",
    chipIdleClass: "border-zinc-300 text-zinc-800 hover:bg-zinc-50",
  },
  endo: {
    label: "Endo",
    stripeClass: "bg-amber-400",
    surfaceClass: "border-amber-200/80 bg-amber-50/70",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-900",
    chipActiveClass: "border-amber-400 bg-amber-400 text-amber-950 hover:bg-amber-400",
    chipIdleClass: "border-amber-200 text-amber-900 hover:bg-amber-50",
  },
  removable: {
    label: "Removable",
    stripeClass: "bg-violet-500",
    surfaceClass: "border-violet-200/80 bg-violet-50/70",
    badgeClass: "border-violet-200 bg-violet-50 text-violet-800",
    chipActiveClass: "border-violet-600 bg-violet-600 text-white hover:bg-violet-600",
    chipIdleClass: "border-violet-200 text-violet-800 hover:bg-violet-50",
  },
  other: {
    label: "Other",
    stripeClass: "bg-slate-400",
    surfaceClass: "border-slate-200/80 bg-slate-50/70",
    badgeClass: "border-slate-200 bg-slate-50 text-slate-700",
    chipActiveClass: "border-slate-600 bg-slate-600 text-white hover:bg-slate-600",
    chipIdleClass: "border-slate-200 text-slate-700 hover:bg-slate-50",
  },
};

function createLocalId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createEmptyMaterial(kind: ProcedureMaterialKind = "supply"): ProcedureMaterialDraft {
  return {
    id: createLocalId("item"),
    name: "",
    kind,
    cost_cents: 0,
  };
}

function createEmptyVisit(label: string): ProcedureVisitDraft {
  return {
    id: createLocalId("visit"),
    label,
    clinical_hours: 0.5,
    items: [createEmptyMaterial("supply")],
  };
}

function createEmptyProcedure(): ProcedureDraft {
  return {
    id: createLocalId("procedure"),
    name: "New Procedure",
    code: null,
    family: "other",
    visits: [createEmptyVisit("1 - Visit")],
    notes: null,
  };
}

function cloneProcedureDraft(procedure: ProcedureDraft): ProcedureDraft {
  return {
    ...procedure,
    id: createLocalId("procedure"),
    name: `${procedure.name} Copy`,
    visits: procedure.visits.map((visit) => ({
      ...visit,
      id: createLocalId("visit"),
      items: visit.items.map((item) => ({
        ...item,
        id: createLocalId("item"),
      })),
    })),
  };
}

function inferProcedureFamily(name: string): ProcedureTreatmentFamily {
  const normalized = name.trim().toLowerCase();

  if (
    normalized.includes("crown") ||
    normalized.includes("fill") ||
    normalized.includes("bridge") ||
    normalized.includes("veneer") ||
    normalized.includes("inlay") ||
    normalized.includes("onlay")
  ) {
    return "restorative";
  }

  if (
    normalized.includes("implant") ||
    normalized.includes("extract") ||
    normalized.includes("surgery") ||
    normalized.includes("graft")
  ) {
    return "surgery";
  }

  if (normalized.includes("root canal") || normalized.includes("endo")) {
    return "endo";
  }

  if (
    normalized.includes("denture") ||
    normalized.includes("partial") ||
    normalized.includes("retainer") ||
    normalized.includes("night guard") ||
    normalized.includes("overdenture")
  ) {
    return "removable";
  }

  return "other";
}

function normalizeProcedureDraft(procedure: ProcedureDraftLike): ProcedureDraft {
  return {
    ...procedure,
    family: procedure.family ?? inferProcedureFamily(procedure.name),
    visits: procedure.visits.map((visit) => ({
      ...visit,
      items: visit.items.map((item) => ({ ...item })),
    })),
  };
}

function isProcedureDraftArray(value: unknown): value is ProcedureDraftLike[] {
  return (
    Array.isArray(value) &&
    value.every(
      (procedure) =>
        procedure &&
        typeof procedure === "object" &&
        "id" in procedure &&
        "name" in procedure &&
        "visits" in procedure &&
        Array.isArray((procedure as ProcedureDraft).visits),
    )
  );
}

export function ProcedureCostWorkspace({
  overheadPerOperatoryHourCents,
  fullCapacityOverheadRateCents,
  overheadSetupRequired,
}: ProcedureCostWorkspaceProps) {
  const [procedures, setProcedures] = useState<ProcedureDraft[]>(
    DEFAULT_PROCEDURE_DRAFTS.map(normalizeProcedureDraft),
  );
  const [expandedIds, setExpandedIds] = useState<string[]>(
    DEFAULT_PROCEDURE_DRAFTS.map((procedure) => procedure.id),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [familyFilter, setFamilyFilter] = useState<ProcedureFamilyFilter>("all");
  const [sortBy, setSortBy] = useState<"cost_desc" | "name_asc" | "hours_desc">(
    "cost_desc",
  );
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (!saved) {
        setHasHydrated(true);
        return;
      }

      const parsed = JSON.parse(saved);
      if (isProcedureDraftArray(parsed) && parsed.length > 0) {
        const normalized = parsed.map(normalizeProcedureDraft);
        setProcedures(normalized);
        setExpandedIds(normalized.map((procedure) => procedure.id));
      }
    } catch {
      // ignore malformed local preview state
    } finally {
      setHasHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(procedures));
  }, [hasHydrated, procedures]);

  const procedureCards = useMemo(
    () =>
      procedures.map((procedure) => ({
        procedure,
        breakdown: calculateProcedureCost(procedure, overheadPerOperatoryHourCents),
      })),
    [procedures, overheadPerOperatoryHourCents],
  );

  const filteredProcedureCards = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const filtered = procedureCards.filter(({ procedure }) => {
      if (familyFilter !== "all" && procedure.family !== familyFilter) {
        return false;
      }

      if (!query) return true;

      const haystack = [
        procedure.name,
        procedure.code ?? "",
        procedure.notes ?? "",
        PROCEDURE_FAMILY_META[procedure.family].label,
        ...procedure.visits.map((visit) => visit.label),
        ...procedure.visits.flatMap((visit) => visit.items.map((item) => item.name)),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });

    return filtered.sort((left, right) => {
      if (sortBy === "name_asc") {
        return left.procedure.name.localeCompare(right.procedure.name);
      }

      if (sortBy === "hours_desc") {
        return right.breakdown.total_clinical_hours - left.breakdown.total_clinical_hours;
      }

      return right.breakdown.total_cost_cents - left.breakdown.total_cost_cents;
    });
  }, [familyFilter, procedureCards, searchQuery, sortBy]);

  const totals = useMemo(() => {
    const direct = procedureCards.reduce(
      (sum, entry) => sum + entry.breakdown.direct_cost_cents,
      0,
    );
    const overhead = procedureCards.reduce(
      (sum, entry) => sum + entry.breakdown.overhead_cost_cents,
      0,
    );
    const total = procedureCards.reduce(
      (sum, entry) => sum + entry.breakdown.total_cost_cents,
      0,
    );
    const highest = procedureCards.reduce(
      (current, entry) =>
        !current || entry.breakdown.total_cost_cents > current.breakdown.total_cost_cents
          ? entry
          : current,
      null as (typeof procedureCards)[number] | null,
    );

    return {
      direct,
      overhead,
      total,
      average: procedureCards.length > 0 ? Math.round(total / procedureCards.length) : 0,
      highest,
    };
  }, [procedureCards]);

  useEffect(() => {
    if (!searchQuery.trim() && familyFilter === "all") return;
    setExpandedIds((current) => [
      ...new Set([...current, ...filteredProcedureCards.map(({ procedure }) => procedure.id)]),
    ]);
  }, [familyFilter, filteredProcedureCards, searchQuery]);

  function toggleProcedure(id: string) {
    setExpandedIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  }

  function updateProcedure(procedureId: string, updates: Partial<ProcedureDraft>) {
    setProcedures((current) =>
      current.map((procedure) =>
        procedure.id === procedureId ? { ...procedure, ...updates } : procedure,
      ),
    );
  }

  function updateVisit(
    procedureId: string,
    visitId: string,
    updates: Partial<ProcedureVisitDraft>,
  ) {
    setProcedures((current) =>
      current.map((procedure) =>
        procedure.id === procedureId
          ? {
              ...procedure,
              visits: procedure.visits.map((visit) =>
                visit.id === visitId ? { ...visit, ...updates } : visit,
              ),
            }
          : procedure,
      ),
    );
  }

  function updateMaterial(
    procedureId: string,
    visitId: string,
    materialId: string,
    updates: Partial<ProcedureMaterialDraft>,
  ) {
    setProcedures((current) =>
      current.map((procedure) =>
        procedure.id === procedureId
          ? {
              ...procedure,
              visits: procedure.visits.map((visit) =>
                visit.id === visitId
                  ? {
                      ...visit,
                      items: visit.items.map((item) =>
                        item.id === materialId ? { ...item, ...updates } : item,
                      ),
                    }
                  : visit,
              ),
            }
          : procedure,
      ),
    );
  }

  function addProcedure() {
    const procedure = createEmptyProcedure();
    setProcedures((current) => [...current, procedure]);
    setExpandedIds((current) => [...current, procedure.id]);
  }

  function removeProcedure(procedureId: string) {
    setProcedures((current) => current.filter((procedure) => procedure.id !== procedureId));
    setExpandedIds((current) => current.filter((id) => id !== procedureId));
  }

  function duplicateProcedure(procedureId: string) {
    const source = procedures.find((procedure) => procedure.id === procedureId);
    if (!source) return;
    const cloned = cloneProcedureDraft(source);
    setProcedures((current) => [...current, cloned]);
    setExpandedIds((current) => [...current, cloned.id]);
  }

  function addVisit(procedureId: string) {
    setProcedures((current) =>
      current.map((procedure) =>
        procedure.id === procedureId
          ? {
              ...procedure,
              visits: [
                ...procedure.visits,
                createEmptyVisit(`${procedure.visits.length + 1} - Visit`),
              ],
            }
          : procedure,
      ),
    );
  }

  function removeVisit(procedureId: string, visitId: string) {
    setProcedures((current) =>
      current.map((procedure) =>
        procedure.id === procedureId
          ? {
              ...procedure,
              visits: procedure.visits.filter((visit) => visit.id !== visitId),
            }
          : procedure,
      ),
    );
  }

  function addMaterial(procedureId: string, visitId: string, kind: ProcedureMaterialKind) {
    setProcedures((current) =>
      current.map((procedure) =>
        procedure.id === procedureId
          ? {
              ...procedure,
              visits: procedure.visits.map((visit) =>
                visit.id === visitId
                  ? { ...visit, items: [...visit.items, createEmptyMaterial(kind)] }
                  : visit,
              ),
            }
          : procedure,
      ),
    );
  }

  function removeMaterial(procedureId: string, visitId: string, materialId: string) {
    setProcedures((current) =>
      current.map((procedure) =>
        procedure.id === procedureId
          ? {
              ...procedure,
              visits: procedure.visits.map((visit) =>
                visit.id === visitId
                  ? {
                      ...visit,
                      items: visit.items.filter((item) => item.id !== materialId),
                    }
                  : visit,
              ),
            }
          : procedure,
      ),
    );
  }

  function resetExamples() {
    const reset = DEFAULT_PROCEDURE_DRAFTS.map(normalizeProcedureDraft);
    setProcedures(reset);
    setExpandedIds(reset.map((procedure) => procedure.id));
    window.localStorage.removeItem(STORAGE_KEY);
  }

  function expandVisibleProcedures() {
    setExpandedIds((current) => [
      ...new Set([...current, ...filteredProcedureCards.map(({ procedure }) => procedure.id)]),
    ]);
  }

  function collapseVisibleProcedures() {
    const visibleIds = new Set(filteredProcedureCards.map(({ procedure }) => procedure.id));
    setExpandedIds((current) => current.filter((id) => !visibleIds.has(id)));
  }

  const visibleProcedureIds = filteredProcedureCards.map(({ procedure }) => procedure.id);
  const allVisibleExpanded =
    visibleProcedureIds.length > 0 &&
    visibleProcedureIds.every((id) => expandedIds.includes(id));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Admin only</Badge>
            <Badge variant="secondary">Visit-based model</Badge>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Model each procedure the same way you read the sheet: total cost up top, visit
            costs in the middle, and the actual supplies and labs inside each appointment.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={resetExamples}>
            <RotateCcw className="h-4 w-4" />
            Reset Examples
          </Button>
          <Button onClick={addProcedure}>
            <Plus className="h-4 w-4" />
            Add Procedure
          </Button>
        </div>
      </div>

      {overheadSetupRequired ? (
        <Card className="border-amber-300/70 bg-amber-50/60">
          <CardHeader>
            <CardTitle className="text-base">Overhead Is Still In Preview Mode</CardTitle>
            <CardDescription className="text-amber-900/80">
              Procedure costing can still use the current overhead rate for planning. Saving the
              overhead side live still depends on applying the overhead migration.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={<Calculator className="h-4 w-4" />}
          label="Current overhead rate"
          value={formatCurrencyFromCents(overheadPerOperatoryHourCents)}
          detail={`Full capacity reference: ${formatCurrencyFromCents(fullCapacityOverheadRateCents)}`}
        />
        <SummaryCard
          icon={<DollarSign className="h-4 w-4" />}
          label="Average modeled cost"
          value={formatCurrencyFromCents(totals.average)}
          detail={`${procedureCards.length} editable procedure${procedureCards.length === 1 ? "" : "s"}`}
        />
        <SummaryCard
          icon={<FlaskConical className="h-4 w-4" />}
          label="Direct cost pool"
          value={formatCurrencyFromCents(totals.direct)}
          detail="All supply and lab rows combined"
        />
        <SummaryCard
          icon={<ClipboardList className="h-4 w-4" />}
          label="Highest modeled cost"
          value={
            totals.highest
              ? formatCurrencyFromCents(totals.highest.breakdown.total_cost_cents)
              : "—"
          }
          detail={
            totals.highest
              ? `${totals.highest.procedure.name} • ${PROCEDURE_FAMILY_META[totals.highest.procedure.family].label}`
              : "Add a procedure to begin"
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Procedures</CardTitle>
          <CardDescription>
            Keep the page quick to scan, then open a procedure only when you want the visit-by-visit
            logic underneath it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 rounded-2xl border bg-muted/15 p-3">
            <div className="flex items-center gap-2 rounded-xl border bg-background px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search procedures, visits, or supplies"
                className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
              />
            </div>

            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div className="space-y-3 xl:flex-1">
                <div className="flex flex-wrap gap-2">
                  <FamilyFilterChip
                    active={familyFilter === "all"}
                    onClick={() => setFamilyFilter("all")}
                    className=""
                  >
                    All procedures
                  </FamilyFilterChip>
                  {PROCEDURE_FAMILY_OPTIONS.map((option) => (
                    <FamilyFilterChip
                      key={option.value}
                      active={familyFilter === option.value}
                      onClick={() => setFamilyFilter(option.value)}
                      className={
                        familyFilter === option.value
                          ? PROCEDURE_FAMILY_META[option.value].chipActiveClass
                          : PROCEDURE_FAMILY_META[option.value].chipIdleClass
                      }
                    >
                      {option.label}
                    </FamilyFilterChip>
                  ))}
                </div>

                <div className="text-sm text-muted-foreground">
                  {filteredProcedureCards.length} result
                  {filteredProcedureCards.length === 1 ? "" : "s"}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                {filteredProcedureCards.length > 1 ? (
                  allVisibleExpanded ? (
                    <Button variant="outline" onClick={collapseVisibleProcedures}>
                      Collapse all
                    </Button>
                  ) : (
                    <Button variant="outline" onClick={expandVisibleProcedures}>
                      Expand all
                    </Button>
                  )
                ) : null}

                <Select
                  value={sortBy}
                  onValueChange={(value) => {
                    if (value === "cost_desc" || value === "name_asc" || value === "hours_desc") {
                      setSortBy(value);
                    }
                  }}
                >
                  <SelectTrigger className="w-[190px] bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cost_desc">Highest cost first</SelectItem>
                    <SelectItem value="name_asc">Name A-Z</SelectItem>
                    <SelectItem value="hours_desc">Most hours first</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {filteredProcedureCards.map(({ procedure, breakdown }) => {
            const expanded = expandedIds.includes(procedure.id);
            const familyMeta = PROCEDURE_FAMILY_META[procedure.family];
            const isLargest =
              totals.highest?.procedure.id === procedure.id && breakdown.total_cost_cents > 0;

            return (
              <div
                key={procedure.id}
                className={cn(
                  "overflow-hidden rounded-2xl border bg-card transition-colors",
                  expanded ? "border-primary/30" : "border-border",
                )}
              >
                <div className={cn("h-1.5", familyMeta.stripeClass)} />

                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => toggleProcedure(procedure.id)}
                      className="flex min-w-0 flex-1 items-start gap-3 text-left"
                    >
                      <div className="mt-1 text-muted-foreground">
                        {expanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                          <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <ProcedureFamilyBadge family={procedure.family} />
                              <div className="truncate text-lg font-semibold">{procedure.name}</div>
                              {procedure.code ? (
                                <Badge variant="outline">{procedure.code}</Badge>
                              ) : null}
                              <Badge variant="secondary">
                                {breakdown.visit_count} visit
                                {breakdown.visit_count === 1 ? "" : "s"}
                              </Badge>
                              {isLargest ? <Badge variant="outline">Highest cost</Badge> : null}
                            </div>

                            <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                              <span>{formatHours(breakdown.total_clinical_hours)} clinical hours</span>
                              <span>•</span>
                              <span>{formatCurrencyFromCents(breakdown.supply_cost_cents)} supplies</span>
                              <span>•</span>
                              <span>{formatCurrencyFromCents(breakdown.lab_cost_cents)} lab</span>
                              <span>•</span>
                              <span>{formatCurrencyFromCents(breakdown.overhead_cost_cents)} overhead</span>
                            </div>
                          </div>

                          <div className="grid min-w-full gap-2 sm:min-w-[420px] sm:grid-cols-4 xl:min-w-[460px]">
                            <SnapshotMetric
                              label="Direct"
                              value={formatCurrencyFromCents(breakdown.direct_cost_cents)}
                            />
                            <SnapshotMetric
                              label="Overhead"
                              value={formatCurrencyFromCents(breakdown.overhead_cost_cents)}
                            />
                            <SnapshotMetric
                              label="Total"
                              value={formatCurrencyFromCents(breakdown.total_cost_cents)}
                              emphasis
                            />
                            <SnapshotMetric
                              label="Cost / hr"
                              value={formatCurrencyFromCents(breakdown.cost_per_hour_cents)}
                            />
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {procedure.visits.map((visit) => {
                            const visitTotals = calculateVisitTotals(visit);
                            return (
                              <div
                                key={visit.id}
                                className={cn(
                                  "rounded-full border px-3 py-1 text-xs text-muted-foreground",
                                  familyMeta.surfaceClass,
                                )}
                              >
                                <span className="font-medium text-foreground">{visit.label}</span>
                                <span className="mx-1 text-muted-foreground">•</span>
                                <span>{formatCurrencyFromCents(visitTotals.direct_cost_cents)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </button>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="icon-sm"
                        onClick={() => duplicateProcedure(procedure.id)}
                        aria-label={`Duplicate ${procedure.name}`}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        onClick={() => removeProcedure(procedure.id)}
                        aria-label={`Remove ${procedure.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {expanded ? (
                    <div className="mt-4 border-t pt-4">
                      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_220px_180px]">
                        <Field
                          label="Procedure name"
                          value={procedure.name}
                          onChange={(value) => {
                            updateProcedure(procedure.id, {
                              name: value,
                              family: inferProcedureFamily(value),
                            });
                          }}
                        />
                        <div className="space-y-2">
                          <Label>Treatment family</Label>
                          <Select
                            value={procedure.family}
                            onValueChange={(value) =>
                              updateProcedure(procedure.id, {
                                family: value as ProcedureTreatmentFamily,
                              })
                            }
                          >
                            <SelectTrigger className="w-full bg-background">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PROCEDURE_FAMILY_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Field
                          label="Code"
                          value={procedure.code ?? ""}
                          onChange={(value) =>
                            updateProcedure(procedure.id, {
                              code: value.trim() ? value : null,
                            })
                          }
                        />
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                        <MiniMetric
                          label="Visits"
                          value={String(breakdown.visit_count)}
                        />
                        <MiniMetric
                          label="Clinical hours"
                          value={formatHours(breakdown.total_clinical_hours)}
                        />
                        <MiniMetric
                          label="Supplies"
                          value={formatCurrencyFromCents(breakdown.supply_cost_cents)}
                        />
                        <MiniMetric
                          label="Lab"
                          value={formatCurrencyFromCents(breakdown.lab_cost_cents)}
                        />
                        <MiniMetric
                          label="Modeled total"
                          value={formatCurrencyFromCents(breakdown.total_cost_cents)}
                        />
                      </div>

                      <div className="mt-5 space-y-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                          <div>
                            <div className="font-medium">Visit Breakdown</div>
                            <p className="text-sm text-muted-foreground">
                              Keep each appointment readable first, then edit the supplies and labs
                              inside it.
                            </p>
                          </div>
                          <Button variant="outline" onClick={() => addVisit(procedure.id)}>
                            <Plus className="h-4 w-4" />
                            Visit
                          </Button>
                        </div>

                        {procedure.visits.map((visit) => {
                          const visitTotals = calculateVisitTotals(visit);
                          const familySurface = PROCEDURE_FAMILY_META[procedure.family].surfaceClass;

                          return (
                            <div
                              key={visit.id}
                              className={cn("rounded-2xl border", familySurface)}
                            >
                              <div className="border-b border-border/70 px-4 py-4">
                                <div className="grid gap-3 xl:grid-cols-[minmax(0,1.3fr)_160px_140px_140px_140px_auto] xl:items-end">
                                  <Field
                                    label="Visit"
                                    value={visit.label}
                                    onChange={(value) =>
                                      updateVisit(procedure.id, visit.id, {
                                        label: value,
                                      })
                                    }
                                  />
                                  <NumberField
                                    label="Hours"
                                    value={visit.clinical_hours}
                                    step="0.25"
                                    onChange={(value) =>
                                      updateVisit(procedure.id, visit.id, {
                                        clinical_hours: value,
                                      })
                                    }
                                  />
                                  <ReadonlyField
                                    label="Supplies"
                                    value={formatCurrencyFromCents(visitTotals.supply_cost_cents)}
                                  />
                                  <ReadonlyField
                                    label="Lab"
                                    value={formatCurrencyFromCents(visitTotals.lab_cost_cents)}
                                  />
                                  <ReadonlyField
                                    label="Visit total"
                                    value={formatCurrencyFromCents(visitTotals.direct_cost_cents)}
                                    emphasize
                                  />
                                  <div className="flex items-end xl:justify-end">
                                    <Button
                                      variant="outline"
                                      size="icon-sm"
                                      onClick={() => removeVisit(procedure.id, visit.id)}
                                      aria-label={`Remove ${visit.label}`}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </div>

                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                  <Badge variant="secondary">
                                    {visit.items.length} item{visit.items.length === 1 ? "" : "s"}
                                  </Badge>
                                  <Badge variant="outline">
                                    {visit.items.filter((item) => item.kind === "supply").length} supplies
                                  </Badge>
                                  <Badge variant="outline">
                                    {visit.items.filter((item) => item.kind === "lab").length} lab
                                  </Badge>
                                </div>
                              </div>

                              <div className="space-y-3 px-4 py-4">
                                <div className="hidden grid-cols-[minmax(0,1fr)_140px_140px_44px] gap-3 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid">
                                  <div>Service</div>
                                  <div>Type</div>
                                  <div>Cost</div>
                                  <div />
                                </div>

                                {visit.items.map((item) => (
                                  <div
                                    key={item.id}
                                    className={cn(
                                      "grid gap-3 rounded-xl border bg-background p-3 md:grid-cols-[minmax(0,1fr)_140px_140px_44px] md:items-end",
                                      item.kind === "lab" ? "border-amber-200/80" : "border-border",
                                    )}
                                  >
                                    <div className="space-y-2">
                                      <Label className="md:hidden">Service</Label>
                                      <Input
                                        value={item.name}
                                        onChange={(e) =>
                                          updateMaterial(procedure.id, visit.id, item.id, {
                                            name: e.target.value,
                                          })
                                        }
                                        placeholder={item.kind === "lab" ? "Lab service" : "Supply"}
                                      />
                                    </div>

                                    <div className="space-y-2">
                                      <Label className="md:hidden">Type</Label>
                                      <Select
                                        value={item.kind}
                                        onValueChange={(value) =>
                                          updateMaterial(procedure.id, visit.id, item.id, {
                                            kind: value as ProcedureMaterialKind,
                                          })
                                        }
                                      >
                                        <SelectTrigger className="w-full bg-background">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="supply">Supply</SelectItem>
                                          <SelectItem value="lab">Lab</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>

                                    <div className="space-y-2">
                                      <Label className="md:hidden">Cost</Label>
                                      <Input
                                        value={(item.cost_cents / 100).toFixed(2)}
                                        onChange={(e) =>
                                          updateMaterial(procedure.id, visit.id, item.id, {
                                            cost_cents: parseDollarAmountToCents(e.target.value),
                                          })
                                        }
                                        placeholder="0.00"
                                      />
                                    </div>

                                    <div className="flex items-end md:justify-end">
                                      <Button
                                        variant="outline"
                                        size="icon-sm"
                                        onClick={() => removeMaterial(procedure.id, visit.id, item.id)}
                                        aria-label={`Remove ${item.name || "item"}`}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  </div>
                                ))}

                                {visit.items.length === 0 ? (
                                  <div className="rounded-xl border border-dashed px-4 py-5 text-sm text-muted-foreground">
                                    No supplies or labs yet for this visit.
                                  </div>
                                ) : null}

                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    variant="outline"
                                    onClick={() => addMaterial(procedure.id, visit.id, "supply")}
                                  >
                                    <Plus className="h-4 w-4" />
                                    Supply
                                  </Button>
                                  <Button
                                    variant="outline"
                                    onClick={() => addMaterial(procedure.id, visit.id, "lab")}
                                  >
                                    <Plus className="h-4 w-4" />
                                    Lab
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {procedure.visits.length === 0 ? (
                          <div className="rounded-xl border border-dashed px-4 py-5 text-sm text-muted-foreground">
                            No visits yet for this procedure.
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-5 space-y-2">
                        <Label>Notes</Label>
                        <Textarea
                          rows={3}
                          value={procedure.notes ?? ""}
                          onChange={(e) =>
                            updateProcedure(procedure.id, {
                              notes: e.target.value ? e.target.value : null,
                            })
                          }
                          placeholder="Assumptions, reminders, or anything worth keeping with this procedure."
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}

          {filteredProcedureCards.length === 0 ? (
            <div className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
              No procedures match this search yet.
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function FamilyFilterChip({
  active,
  onClick,
  className,
  children,
}: {
  active: boolean;
  onClick: () => void;
  className: string;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      size="sm"
      onClick={onClick}
      className={className}
    >
      {children}
    </Button>
  );
}

function ProcedureFamilyBadge({ family }: { family: ProcedureTreatmentFamily }) {
  const meta = PROCEDURE_FAMILY_META[family];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        meta.badgeClass,
      )}
    >
      {meta.label}
    </span>
  );
}

function SnapshotMetric({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2",
        emphasis ? "border-primary/25 bg-primary/5" : "bg-background",
      )}
    >
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-1 font-semibold", emphasis ? "text-lg" : "text-base")}>{value}</div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <Card size="sm">
      <CardContent className="space-y-2 pt-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
        </div>
        <div className="text-2xl font-semibold">{value}</div>
        {detail ? <div className="text-xs text-muted-foreground">{detail}</div> : null}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function NumberField({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number;
  step: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type="number"
        min="0"
        step={step}
        value={String(value)}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </div>
  );
}

function ReadonlyField({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div
        className={cn(
          "rounded-xl border px-3 py-2.5 text-sm font-medium",
          emphasize ? "border-primary/25 bg-primary/5 text-foreground" : "bg-background",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-background px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
