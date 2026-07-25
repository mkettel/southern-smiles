"use client";

import { useEffect, useMemo, useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Activity,
  Boxes,
  Check,
  CircleDollarSign,
  Clock3,
  Copy,
  FlaskConical,
  Gauge,
  GripVertical,
  Layers3,
  ListTree,
  MoreHorizontal,
  PackageOpen,
  PackageSearch,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Scissors,
  Shapes,
  Sparkles,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { parseDollarAmountToCents } from "@/lib/bills";
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
import type { SupplyCatalogItem } from "@/lib/supply-ordering";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "procedure-cost-workspace-v4";
const ORDER_MIGRATION_KEY = "procedure-cost-preferred-order-v1";
const INITIAL_PREFERRED_ORDER = ["filling", "crown", "bridge"];

interface ProcedureCostWorkspaceProps {
  overheadPerOperatoryHourCents: number | null;
  fullCapacityOverheadRateCents: number | null;
  overheadSetupRequired: boolean;
  supplyCatalog: SupplyCatalogItem[];
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

const PROCEDURE_FAMILY_LABELS: Record<ProcedureTreatmentFamily, string> = {
  restorative: "Restorative",
  surgery: "Surgery",
  endo: "Endo",
  removable: "Removable",
  other: "Other",
};

const PROCEDURE_FAMILY_META: Record<
  ProcedureTreatmentFamily,
  { icon: LucideIcon; className: string }
> = {
  restorative: {
    icon: Sparkles,
    className: "border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-300",
  },
  surgery: {
    icon: Scissors,
    className: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300",
  },
  endo: {
    icon: Activity,
    className: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  },
  removable: {
    icon: Layers3,
    className: "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300",
  },
  other: {
    icon: Shapes,
    className: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300",
  },
};

function createLocalId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatDollarInputValue(cents: number) {
  return (cents / 100).toFixed(2);
}

function createEmptyMaterial(kind: ProcedureMaterialKind = "supply"): ProcedureMaterialDraft {
  return {
    id: createLocalId("item"),
    name: "",
    kind,
    cost_cents: 0,
    catalog_item_id: null,
    quantity_used: 1,
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
      items: visit.items.map((item) => ({
        ...item,
        catalog_item_id: item.catalog_item_id ?? null,
        quantity_used: item.quantity_used ?? 1,
      })),
    })),
  };
}

function applyInitialPreferredOrder(procedures: ProcedureDraft[]) {
  const preferred = INITIAL_PREFERRED_ORDER.map((id) =>
    procedures.find((procedure) => procedure.id === id),
  ).filter((procedure): procedure is ProcedureDraft => Boolean(procedure));
  const preferredIds = new Set(preferred.map((procedure) => procedure.id));

  return [
    ...preferred,
    ...procedures.filter((procedure) => !preferredIds.has(procedure.id)),
  ];
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
  supplyCatalog,
}: ProcedureCostWorkspaceProps) {
  const [procedures, setProcedures] = useState<ProcedureDraft[]>(
    applyInitialPreferredOrder(DEFAULT_PROCEDURE_DRAFTS.map(normalizeProcedureDraft)),
  );
  const [selectedProcedureId, setSelectedProcedureId] = useState(
    DEFAULT_PROCEDURE_DRAFTS[0]?.id ?? "",
  );
  const [selectedVisitId, setSelectedVisitId] = useState(
    DEFAULT_PROCEDURE_DRAFTS[0]?.visits[0]?.id ?? "",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [familyFilter, setFamilyFilter] = useState<ProcedureFamilyFilter>("all");
  const [editingDetails, setEditingDetails] = useState(false);
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [catalogPickerOpen, setCatalogPickerOpen] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [hasHydrated, setHasHydrated] = useState(false);
  const procedureSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (!saved) return;

      const parsed = JSON.parse(saved);
      if (isProcedureDraftArray(parsed) && parsed.length > 0) {
        const normalized = parsed.map(normalizeProcedureDraft);
        const shouldApplyPreferredOrder =
          !window.localStorage.getItem(ORDER_MIGRATION_KEY);
        const ordered = shouldApplyPreferredOrder
          ? applyInitialPreferredOrder(normalized)
          : normalized;

        if (shouldApplyPreferredOrder) {
          window.localStorage.setItem(ORDER_MIGRATION_KEY, "complete");
        }

        setProcedures(ordered);
        setSelectedProcedureId(ordered[0].id);
        setSelectedVisitId(ordered[0].visits[0]?.id ?? "");
      }
    } catch {
      // Ignore malformed local preview state.
    } finally {
      setHasHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(procedures));
  }, [hasHydrated, procedures]);

  const catalogById = useMemo(
    () => new Map(supplyCatalog.map((item) => [item.id, item])),
    [supplyCatalog],
  );
  const resolvedProcedures = useMemo(
    () =>
      procedures.map((procedure) => ({
        ...procedure,
        visits: procedure.visits.map((visit) => ({
          ...visit,
          items: visit.items.map((item) => {
            const catalogItem = item.catalog_item_id
              ? catalogById.get(item.catalog_item_id)
              : null;
            if (!catalogItem) return item;
            return {
              ...item,
              name: catalogItem.name,
              cost_cents: Math.round(
                (catalogItem.current_unit_cost_cents ?? 0) * (item.quantity_used ?? 1),
              ),
            };
          }),
        })),
      })),
    [catalogById, procedures],
  );
  const procedureCards = useMemo(
    () =>
      resolvedProcedures.map((procedure) => ({
        procedure,
        breakdown: calculateProcedureCost(procedure, overheadPerOperatoryHourCents),
      })),
    [overheadPerOperatoryHourCents, resolvedProcedures],
  );
  const filteredSupplyCatalog = useMemo(() => {
    const query = catalogQuery.trim().toLowerCase();
    return supplyCatalog
      .filter((item) => item.current_unit_cost_cents !== null)
      .filter((item) =>
        !query
          ? true
          : `${item.name} ${item.vendor} ${item.unit_label}`
              .toLowerCase()
              .includes(query),
      )
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [catalogQuery, supplyCatalog]);

  const filteredProcedureCards = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return procedureCards.filter(({ procedure }) => {
        if (familyFilter !== "all" && procedure.family !== familyFilter) return false;
        if (!query) return true;

        return [
          procedure.name,
          procedure.code ?? "",
          PROCEDURE_FAMILY_LABELS[procedure.family],
          ...procedure.visits.map((visit) => visit.label),
          ...procedure.visits.flatMap((visit) => visit.items.map((item) => item.name)),
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      });
  }, [familyFilter, procedureCards, searchQuery]);

  const selectedCard =
    procedureCards.find(({ procedure }) => procedure.id === selectedProcedureId) ??
    procedureCards[0] ??
    null;
  const selectedProcedure = selectedCard?.procedure ?? null;
  const selectedBreakdown = selectedCard?.breakdown ?? null;
  const selectedVisit =
    selectedProcedure?.visits.find((visit) => visit.id === selectedVisitId) ??
    selectedProcedure?.visits[0] ??
    null;
  const selectedVisitTotals = selectedVisit ? calculateVisitTotals(selectedVisit) : null;
  const selectedVisitOverheadCents = Math.round(
    (selectedVisit?.clinical_hours ?? 0) * (overheadPerOperatoryHourCents ?? 0),
  );

  useEffect(() => {
    if (!selectedProcedure && procedures[0]) {
      setSelectedProcedureId(procedures[0].id);
      setSelectedVisitId(procedures[0].visits[0]?.id ?? "");
      return;
    }

    if (
      selectedProcedure &&
      !selectedProcedure.visits.some((visit) => visit.id === selectedVisitId)
    ) {
      setSelectedVisitId(selectedProcedure.visits[0]?.id ?? "");
    }
  }, [procedures, selectedProcedure, selectedVisitId]);

  function selectProcedure(procedure: ProcedureDraft) {
    setSelectedProcedureId(procedure.id);
    setSelectedVisitId(procedure.visits[0]?.id ?? "");
    setEditingDetails(false);
    setEditingMaterialId(null);
  }

  function handleProcedureDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const visibleIds = filteredProcedureCards.map(({ procedure }) => procedure.id);
    const oldIndex = visibleIds.indexOf(String(active.id));
    const newIndex = visibleIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    const reorderedVisibleIds = arrayMove(visibleIds, oldIndex, newIndex);
    const visibleIdSet = new Set(visibleIds);

    setProcedures((current) => {
      const proceduresById = new Map(
        current.map((procedure) => [procedure.id, procedure]),
      );
      let visibleIndex = 0;

      return current.map((procedure) => {
        if (!visibleIdSet.has(procedure.id)) return procedure;
        const nextId = reorderedVisibleIds[visibleIndex++];
        return proceduresById.get(nextId) ?? procedure;
      });
    });
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
    selectProcedure(procedure);
    setEditingDetails(true);
  }

  function duplicateProcedure() {
    if (!selectedProcedure) return;
    const cloned = cloneProcedureDraft(selectedProcedure);
    setProcedures((current) => [...current, cloned]);
    selectProcedure(cloned);
  }

  function removeProcedure() {
    if (!selectedProcedure) return;
    const remaining = procedures.filter((procedure) => procedure.id !== selectedProcedure.id);
    setProcedures(remaining);
    setSelectedProcedureId(remaining[0]?.id ?? "");
    setSelectedVisitId(remaining[0]?.visits[0]?.id ?? "");
  }

  function addVisit() {
    if (!selectedProcedure) return;
    const visit = createEmptyVisit(`${selectedProcedure.visits.length + 1} - Visit`);
    setProcedures((current) =>
      current.map((procedure) =>
        procedure.id === selectedProcedure.id
          ? { ...procedure, visits: [...procedure.visits, visit] }
          : procedure,
      ),
    );
    setSelectedVisitId(visit.id);
  }

  function removeVisit() {
    if (!selectedProcedure || !selectedVisit) return;
    const remaining = selectedProcedure.visits.filter((visit) => visit.id !== selectedVisit.id);
    updateProcedure(selectedProcedure.id, { visits: remaining });
    setSelectedVisitId(remaining[0]?.id ?? "");
  }

  function addMaterial(kind: ProcedureMaterialKind) {
    if (!selectedProcedure || !selectedVisit) return;
    const material = createEmptyMaterial(kind);
    updateVisit(selectedProcedure.id, selectedVisit.id, {
      items: [...selectedVisit.items, material],
    });
    setEditingMaterialId(material.id);
  }

  function addCatalogMaterial(catalogItem: SupplyCatalogItem) {
    if (!selectedProcedure || !selectedVisit) return;
    const material: ProcedureMaterialDraft = {
      id: createLocalId("item"),
      name: catalogItem.name,
      kind: "supply",
      cost_cents: catalogItem.current_unit_cost_cents ?? 0,
      catalog_item_id: catalogItem.id,
      quantity_used: 1,
    };
    updateVisit(selectedProcedure.id, selectedVisit.id, {
      items: [...selectedVisit.items, material],
    });
    setEditingMaterialId(material.id);
    setCatalogPickerOpen(false);
    setCatalogQuery("");
  }

  function removeMaterial(materialId: string) {
    if (!selectedProcedure || !selectedVisit) return;
    updateVisit(selectedProcedure.id, selectedVisit.id, {
      items: selectedVisit.items.filter((item) => item.id !== materialId),
    });
    if (editingMaterialId === materialId) setEditingMaterialId(null);
  }

  function resetExamples() {
    const reset = applyInitialPreferredOrder(
      DEFAULT_PROCEDURE_DRAFTS.map(normalizeProcedureDraft),
    );
    setProcedures(reset);
    setSelectedProcedureId(reset[0]?.id ?? "");
    setSelectedVisitId(reset[0]?.visits[0]?.id ?? "");
    setEditingDetails(false);
    setEditingMaterialId(null);
    window.localStorage.removeItem(STORAGE_KEY);
  }

  if (!selectedProcedure || !selectedBreakdown) {
    return (
      <div className="rounded-lg border border-dashed px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">No procedures are modeled yet.</p>
        <Button className="mt-4" onClick={addProcedure}>
          <Plus className="h-4 w-4" />
          Add procedure
        </Button>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-t-2 border-t-cyan-600/70 bg-background shadow-sm">
      {overheadSetupRequired ? (
        <div className="border-b border-amber-300/70 bg-amber-50 px-5 py-3 text-sm text-amber-950">
          Overhead is still using the current planning rate. Apply the overhead migration before
          treating these totals as final.
        </div>
      ) : null}

      <div className="grid min-h-[720px] lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="border-b bg-muted/10 lg:border-r lg:border-b-0">
          <div className="border-b p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300">
                  <ListTree className="h-4 w-4" />
                </span>
                <h2 className="font-semibold">Procedure navigator</h2>
              </div>
              <Button
                size="icon-sm"
                variant="outline"
                onClick={addProcedure}
                aria-label="Add procedure"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center gap-2 rounded-md border bg-background px-3">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search procedures"
                className="h-9 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
              />
            </div>

            <Select
              value={familyFilter}
              onValueChange={(value) => setFamilyFilter(value as ProcedureFamilyFilter)}
            >
              <SelectTrigger className="mt-2 w-full bg-background">
                <SelectValue>
                  {familyFilter === "all"
                    ? "All families"
                    : PROCEDURE_FAMILY_LABELS[familyFilter]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All families</SelectItem>
                {PROCEDURE_FAMILY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DndContext
            id="procedure-navigator-dnd"
            sensors={procedureSensors}
            collisionDetection={closestCenter}
            onDragEnd={handleProcedureDragEnd}
          >
            <SortableContext
              items={filteredProcedureCards.map(({ procedure }) => procedure.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="max-h-[620px] overflow-y-auto">
                {filteredProcedureCards.map(({ procedure, breakdown }) => (
                  <SortableProcedureRow
                    key={procedure.id}
                    procedure={procedure}
                    totalCostCents={breakdown.total_cost_cents}
                    active={procedure.id === selectedProcedure.id}
                    onSelect={() => selectProcedure(procedure)}
                  />
                ))}

                {filteredProcedureCards.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No matching procedures.
                  </p>
                ) : null}
              </div>
            </SortableContext>
          </DndContext>
        </aside>

        <section className="min-w-0">
          <div className="border-b px-5 py-5 xl:px-7">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-3xl font-semibold">{selectedProcedure.name}</h1>
                  {selectedProcedure.code ? (
                    <span className="rounded border px-2 py-0.5 text-xs text-muted-foreground">
                      {selectedProcedure.code}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <FamilyBadge family={selectedProcedure.family} />
                  <span className="text-sm text-muted-foreground">
                    {selectedBreakdown.visit_count} visit
                    {selectedBreakdown.visit_count === 1 ? "" : "s"}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={duplicateProcedure}>
                  <Copy className="h-4 w-4" />
                  Duplicate
                </Button>
                <Button variant="outline" onClick={() => setEditingDetails((current) => !current)}>
                  {editingDetails ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                  {editingDetails ? "Close details" : "Edit details"}
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={removeProcedure}
                  aria-label={`Remove ${selectedProcedure.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {editingDetails ? (
              <div className="mt-5 grid gap-4 border-t pt-5 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_220px_160px]">
                <Field
                  label="Procedure name"
                  value={selectedProcedure.name}
                  onChange={(value) =>
                    updateProcedure(selectedProcedure.id, {
                      name: value,
                      family: inferProcedureFamily(value),
                    })
                  }
                />
                <div className="space-y-2">
                  <Label>Treatment family</Label>
                  <Select
                    value={selectedProcedure.family}
                    onValueChange={(value) =>
                      updateProcedure(selectedProcedure.id, {
                        family: value as ProcedureTreatmentFamily,
                      })
                    }
                  >
                    <SelectTrigger className="w-full bg-background">
                      <SelectValue>
                        {PROCEDURE_FAMILY_LABELS[selectedProcedure.family]}
                      </SelectValue>
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
                  value={selectedProcedure.code ?? ""}
                  onChange={(value) =>
                    updateProcedure(selectedProcedure.id, {
                      code: value.trim() ? value : null,
                    })
                  }
                />
                <div className="space-y-2 md:col-span-2 xl:col-span-3">
                  <Label>Notes</Label>
                  <Textarea
                    rows={2}
                    value={selectedProcedure.notes ?? ""}
                    onChange={(event) =>
                      updateProcedure(selectedProcedure.id, {
                        notes: event.target.value || null,
                      })
                    }
                    placeholder="Assumptions or reminders for this procedure"
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid border-b sm:grid-cols-2 xl:grid-cols-5">
            <CostMetric
              label="Total modeled cost"
              value={formatCurrencyFromCents(selectedBreakdown.total_cost_cents)}
              icon={CircleDollarSign}
              accentClassName="bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"
              panelClassName="bg-sky-50/30 dark:bg-sky-950/10"
              emphasized
            />
            <CostMetric
              label="Supplies"
              value={formatCurrencyFromCents(selectedBreakdown.supply_cost_cents)}
              icon={PackageOpen}
              accentClassName="bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300"
            />
            <CostMetric
              label="Lab"
              value={formatCurrencyFromCents(selectedBreakdown.lab_cost_cents)}
              icon={FlaskConical}
              accentClassName="bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
            />
            <CostMetric
              label="Chair overhead"
              value={formatCurrencyFromCents(selectedBreakdown.overhead_cost_cents)}
              detail={`${formatCurrencyFromCents(overheadPerOperatoryHourCents)} / hr`}
              icon={Clock3}
              accentClassName="bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
            />
            <CostMetric
              label="Cost per hour"
              value={formatCurrencyFromCents(selectedBreakdown.cost_per_hour_cents)}
              detail={`Full capacity ${formatCurrencyFromCents(fullCapacityOverheadRateCents)} / hr`}
              icon={Gauge}
              accentClassName="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
            />
          </div>

          <div className="px-5 py-5 xl:px-7">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium">Visits</h3>
              <Button size="sm" variant="outline" onClick={addVisit}>
                <Plus className="h-4 w-4" />
                Visit
              </Button>
            </div>

            {selectedProcedure.visits.length ? (
              <div className="grid overflow-hidden rounded-md border md:grid-cols-2 xl:grid-cols-3">
                {selectedProcedure.visits.map((visit, index) => {
                  const visitTotals = calculateVisitTotals(visit);
                  const active = visit.id === selectedVisit?.id;
                  return (
                    <button
                      key={visit.id}
                      type="button"
                      onClick={() => {
                        setSelectedVisitId(visit.id);
                        setEditingMaterialId(null);
                      }}
                      className={cn(
                        "flex min-h-16 items-center gap-3 border-b px-4 py-3 text-left last:border-b-0 md:border-r",
                        active
                          ? "bg-cyan-50/60 ring-1 ring-inset ring-cyan-600 dark:bg-cyan-950/20"
                          : "hover:bg-muted/40",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs",
                          active ? "bg-cyan-700 text-white" : "bg-muted",
                        )}
                      >
                        {index + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{visit.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatHours(visit.clinical_hours)} hr ·{" "}
                          {formatCurrencyFromCents(
                            visitTotals.direct_cost_cents +
                              Math.round(
                                visit.clinical_hours * (overheadPerOperatoryHourCents ?? 0),
                              ),
                          )}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                No visits yet. Add the first visit to begin the recipe.
              </div>
            )}

            {selectedVisit && selectedVisitTotals ? (
              <div className="mt-6 rounded-lg border">
                <div className="flex flex-col gap-4 border-b px-4 py-4 xl:flex-row xl:items-end xl:justify-between">
                  <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
                    <Field
                      label="Visit"
                      value={selectedVisit.label}
                      onChange={(value) =>
                        updateVisit(selectedProcedure.id, selectedVisit.id, { label: value })
                      }
                    />
                    <NumberField
                      label="Clinical hours"
                      value={selectedVisit.clinical_hours}
                      onChange={(value) =>
                        updateVisit(selectedProcedure.id, selectedVisit.id, {
                          clinical_hours: value,
                        })
                      }
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => setCatalogPickerOpen(true)}>
                      <Plus className="h-4 w-4" />
                      Supply
                    </Button>
                    <Button variant="outline" onClick={() => addMaterial("lab")}>
                      <FlaskConical className="h-4 w-4" />
                      Lab
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={removeVisit}
                      aria-label={`Remove ${selectedVisit.label}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="max-h-[420px] overflow-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="sticky top-0 z-10 border-b bg-muted text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium">Item</th>
                        <th className="px-4 py-3 font-medium">Source</th>
                        <th className="px-4 py-3 font-medium">Quantity used</th>
                        <th className="px-4 py-3 font-medium">Current cost</th>
                        <th className="px-4 py-3 text-right font-medium">Cost per procedure</th>
                        <th className="w-12 px-3 py-3">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {selectedVisit.items.map((item) => {
                        const editing = item.id === editingMaterialId;
                        const catalogItem = item.catalog_item_id
                          ? catalogById.get(item.catalog_item_id)
                          : null;
                        const unitCostCents = catalogItem?.current_unit_cost_cents
                          ?? item.cost_cents;
                        return (
                          <tr
                            key={item.id}
                            className={cn(
                              "transition-colors hover:bg-muted/20",
                              editing && "bg-cyan-50/50 dark:bg-cyan-950/15",
                            )}
                          >
                            <td className="px-4 py-3">
                              {editing && !catalogItem ? (
                                <Input
                                  value={item.name}
                                  onChange={(event) =>
                                    updateMaterial(
                                      selectedProcedure.id,
                                      selectedVisit.id,
                                      item.id,
                                      { name: event.target.value },
                                    )
                                  }
                                  placeholder={item.kind === "lab" ? "Lab service" : "Supply item"}
                                />
                              ) : (
                                <div>
                                  <div className="font-medium">{item.name || "Unnamed item"}</div>
                                  <div className="mt-0.5 text-xs text-muted-foreground">
                                    {catalogItem
                                      ? `${catalogItem.vendor} catalog item`
                                      : item.kind === "supply"
                                      ? "Manual supply cost"
                                      : "External lab or service"}
                                  </div>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {editing && !catalogItem ? (
                                <Select
                                  value={item.kind}
                                  onValueChange={(value) =>
                                    updateMaterial(
                                      selectedProcedure.id,
                                      selectedVisit.id,
                                      item.id,
                                      { kind: value as ProcedureMaterialKind },
                                    )
                                  }
                                >
                                  <SelectTrigger className="w-32 bg-background">
                                    <SelectValue>
                                      {item.kind === "supply" ? "Supply" : "Lab"}
                                    </SelectValue>
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="supply">Supply</SelectItem>
                                    <SelectItem value="lab">Lab</SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-medium",
                                    item.kind === "supply"
                                      ? "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-300"
                                      : "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300",
                                  )}
                                >
                                  {catalogItem ? (
                                    <PackageOpen className="h-3 w-3" />
                                  ) : item.kind === "supply" ? (
                                    <Boxes className="h-3 w-3" />
                                  ) : (
                                    <FlaskConical className="h-3 w-3" />
                                  )}
                                  {catalogItem
                                    ? "Catalog"
                                    : item.kind === "supply"
                                      ? "Manual"
                                      : "Lab"}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {editing && catalogItem ? (
                                <Input
                                  className="w-24"
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={String(item.quantity_used ?? 1)}
                                  onChange={(event) =>
                                    updateMaterial(
                                      selectedProcedure.id,
                                      selectedVisit.id,
                                      item.id,
                                      { quantity_used: Math.max(0, Number(event.target.value) || 0) },
                                    )
                                  }
                                  aria-label={`Quantity of ${item.name} used`}
                                />
                              ) : (
                                <span className="text-muted-foreground">
                                  {item.quantity_used ?? 1}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {editing && !catalogItem ? (
                                <DollarAmountInput
                                  cents={item.cost_cents}
                                  onCentsChange={(costCents) =>
                                    updateMaterial(
                                      selectedProcedure.id,
                                      selectedVisit.id,
                                      item.id,
                                      { cost_cents: costCents },
                                    )
                                  }
                                />
                              ) : (
                                <div>
                                  <span className="tabular-nums">
                                    {formatCurrencyFromCents(unitCostCents)}
                                  </span>
                                  {catalogItem ? (
                                    <div className="mt-0.5 text-xs text-muted-foreground">
                                      per {catalogItem.unit_label}
                                    </div>
                                  ) : null}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold tabular-nums">
                              {formatCurrencyFromCents(item.cost_cents)}
                            </td>
                            <td className="px-3 py-3 text-right">
                              {editing ? (
                                <div className="flex justify-end gap-1">
                                  <Button
                                    size="icon-sm"
                                    variant="ghost"
                                    onClick={() => setEditingMaterialId(null)}
                                    aria-label={`Finish editing ${item.name || "item"}`}
                                  >
                                    <Check className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="icon-sm"
                                    variant="ghost"
                                    onClick={() => removeMaterial(item.id)}
                                    aria-label={`Remove ${item.name || "item"}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  onClick={() => setEditingMaterialId(item.id)}
                                  aria-label={`Edit ${item.name || "item"}`}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {selectedVisit.items.length === 0 ? (
                  <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No supplies or lab services are assigned to this visit.
                  </div>
                ) : null}

                <div className="grid border-t sm:grid-cols-2 xl:grid-cols-4">
                  <VisitTotal
                    label="Supplies"
                    value={formatCurrencyFromCents(selectedVisitTotals.supply_cost_cents)}
                  />
                  <VisitTotal
                    label="Lab"
                    value={formatCurrencyFromCents(selectedVisitTotals.lab_cost_cents)}
                  />
                  <VisitTotal
                    label="Chair overhead"
                    value={formatCurrencyFromCents(selectedVisitOverheadCents)}
                  />
                  <VisitTotal
                    label="Visit total"
                    value={formatCurrencyFromCents(
                      selectedVisitTotals.direct_cost_cents + selectedVisitOverheadCents,
                    )}
                    emphasized
                  />
                </div>
              </div>
            ) : null}

            <div className="mt-4 flex justify-end">
              <Button size="sm" variant="ghost" onClick={resetExamples}>
                <RotateCcw className="h-4 w-4" />
                Reset examples
              </Button>
            </div>

            <Dialog open={catalogPickerOpen} onOpenChange={setCatalogPickerOpen}>
              <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Select a catalog supply</DialogTitle>
                  <DialogDescription>
                    Choose the item used during this visit. Its current catalog price will keep
                    this procedure cost up to date.
                  </DialogDescription>
                </DialogHeader>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    value={catalogQuery}
                    onChange={(event) => setCatalogQuery(event.target.value)}
                    placeholder="Search supplies or vendors"
                    autoFocus
                  />
                </div>
                <div className="max-h-[420px] overflow-y-auto rounded-lg border">
                  {filteredSupplyCatalog.length ? (
                    filteredSupplyCatalog.map((catalogItem) => (
                      <button
                        key={catalogItem.id}
                        type="button"
                        className="flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/50 focus-visible:bg-muted focus-visible:outline-none"
                        onClick={() => addCatalogMaterial(catalogItem)}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
                          <PackageSearch className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{catalogItem.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {catalogItem.vendor}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block font-semibold tabular-nums">
                            {formatCurrencyFromCents(catalogItem.current_unit_cost_cents)}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            per {catalogItem.unit_label}
                          </span>
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="px-6 py-10 text-center text-sm text-muted-foreground">
                      No priced catalog supplies match that search.
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between border-t pt-4">
                  <p className="text-xs text-muted-foreground">
                    Need an exception? Add it as a manual supply instead.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setCatalogPickerOpen(false);
                      addMaterial("supply");
                    }}
                  >
                    Manual supply
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </section>
      </div>
    </div>
  );
}

function SortableProcedureRow({
  procedure,
  totalCostCents,
  active,
  onSelect,
}: {
  procedure: ProcedureDraft;
  totalCostCents: number;
  active: boolean;
  onSelect: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: procedure.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "group/procedure relative border-b bg-background",
        isDragging && "z-20 opacity-70 shadow-md",
      )}
    >
      <button
        type="button"
        className="absolute left-1 top-1/2 z-10 flex h-8 w-6 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/40 opacity-0 transition-opacity hover:bg-muted hover:text-muted-foreground focus-visible:opacity-100 group-hover/procedure:opacity-100 active:cursor-grabbing"
        aria-label={`Move ${procedure.name}`}
        title="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "flex w-full items-center justify-between gap-3 px-4 py-3 pl-8 text-left transition-colors",
          active
            ? "border-l-2 border-l-cyan-600 bg-cyan-50/70 pl-[30px] dark:bg-cyan-950/20"
            : "hover:bg-muted/40",
        )}
      >
        <span className="min-w-0">
          <span className="block truncate font-medium">{procedure.name}</span>
          <FamilyBadge family={procedure.family} compact />
        </span>
        <span className="shrink-0 text-sm font-medium tabular-nums">
          {formatCurrencyFromCents(totalCostCents)}
        </span>
      </button>
    </div>
  );
}

function CostMetric({
  label,
  value,
  detail,
  icon: Icon,
  accentClassName,
  panelClassName,
  emphasized = false,
}: {
  label: string;
  value: string;
  detail?: string;
  icon: LucideIcon;
  accentClassName: string;
  panelClassName?: string;
  emphasized?: boolean;
}) {
  return (
    <div className={cn("border-b px-5 py-4 sm:border-r xl:border-b-0", panelClassName)}>
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
            accentClassName,
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase text-muted-foreground">{label}</div>
          <div
            className={cn("mt-1 font-semibold tabular-nums", emphasized ? "text-xl" : "text-lg")}
          >
            {value}
          </div>
          {detail ? <div className="mt-1 text-xs text-muted-foreground">{detail}</div> : null}
        </div>
      </div>
    </div>
  );
}

function FamilyBadge({
  family,
  compact = false,
}: {
  family: ProcedureTreatmentFamily;
  compact?: boolean;
}) {
  const meta = PROCEDURE_FAMILY_META[family];
  const Icon = meta.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border font-medium",
        compact ? "mt-1 rounded px-1.5 py-0.5 text-[10px]" : "rounded-md px-2 py-1 text-xs",
        meta.className,
      )}
    >
      <Icon className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
      {PROCEDURE_FAMILY_LABELS[family]}
    </span>
  );
}

function VisitTotal({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div className={cn("border-b px-4 py-3 sm:border-r xl:border-b-0", emphasized && "bg-primary/5")}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1 font-semibold tabular-nums", emphasized && "text-primary")}>
        {value}
      </div>
    </div>
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
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type="number"
        min="0"
        step="0.25"
        value={String(value)}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
      />
    </div>
  );
}

function DollarAmountInput({
  cents,
  onCentsChange,
}: {
  cents: number;
  onCentsChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(formatDollarInputValue(cents));

  return (
    <Input
      inputMode="decimal"
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        onCentsChange(parseDollarAmountToCents(event.target.value));
      }}
      onFocus={(event) => {
        event.currentTarget.select();
      }}
      onBlur={() => {
        const nextCents = parseDollarAmountToCents(draft);
        onCentsChange(nextCents);
        setDraft(formatDollarInputValue(nextCents));
      }}
      placeholder="0.00"
    />
  );
}
