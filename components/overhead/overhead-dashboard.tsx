"use client";

import type { ChangeEvent, Dispatch, ReactNode, SetStateAction } from "react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Calculator,
  ChevronDown,
  ChevronRight,
  DollarSign,
  FileUp,
  Pencil,
  Plus,
  Receipt,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import {
  createOverheadCategory,
  createOverheadItem,
  deleteOverheadItem,
  getOverheadDashboardData,
  importOverheadCsv,
  updateOverheadCategory,
  updateOverheadItem,
  updateOverheadSettings,
} from "@/actions/overhead";
import { formatCurrencyFromCents, formatHours } from "@/lib/overhead";
import { parseDollarAmountToCents } from "@/lib/bills";
import type {
  OverheadCategorySummary,
  OverheadDashboardData,
  OverheadImportPreview,
  OverheadItem,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface OverheadDashboardProps {
  initialData: OverheadDashboardData;
  featureLabel?: string;
}

type CostTypeFilter = "all" | "fixed" | "variable";

export function OverheadDashboard({ initialData, featureLabel = "Overhead" }: OverheadDashboardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState(initialData);
  const [importPreview, setImportPreview] = useState<OverheadImportPreview | null>(null);
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState<string>("all");
  const [costTypeFilter, setCostTypeFilter] = useState<CostTypeFilter>("all");
  const [settingsDraft, setSettingsDraft] = useState({
    operatories_count: String(initialData.settings.operatories_count),
    days_per_week: String(initialData.settings.days_per_week),
    clinical_hours_per_day: String(initialData.settings.clinical_hours_per_day),
    weeks_per_month: String(initialData.settings.weeks_per_month),
    utilization_percent: String(initialData.settings.utilization_percent),
    notes: initialData.settings.notes ?? "",
  });
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setData(initialData);
    setSettingsDraft({
      operatories_count: String(initialData.settings.operatories_count),
      days_per_week: String(initialData.settings.days_per_week),
      clinical_hours_per_day: String(initialData.settings.clinical_hours_per_day),
      weeks_per_month: String(initialData.settings.weeks_per_month),
      utilization_percent: String(initialData.settings.utilization_percent),
      notes: initialData.settings.notes ?? "",
    });
  }, [initialData]);

  useEffect(() => {
    setExpandedCategoryIds((current) => {
      const validIds = current.filter((id) => data.categories.some((category) => category.id === id));
      if (validIds.length > 0 || data.categories.length === 0) {
        return validIds;
      }
      return [data.categories[0].id];
    });
  }, [data.categories]);

  const itemsByCategory = useMemo(() => {
    const groups = new Map<string, OverheadItem[]>();
    const sortedItems = [...data.items].sort((left, right) => {
      if (left.category_id !== right.category_id) {
        return left.category_id.localeCompare(right.category_id);
      }
      if (left.display_order !== right.display_order) {
        return left.display_order - right.display_order;
      }
      return left.name.localeCompare(right.name);
    });

    for (const item of sortedItems) {
      const existing = groups.get(item.category_id) ?? [];
      existing.push(item);
      groups.set(item.category_id, existing);
    }

    return groups;
  }, [data.items]);

  const capacitySummary = `${data.settings.operatories_count} operatories • ${data.settings.days_per_week} days/week • ${data.settings.clinical_hours_per_day} clinical hrs/day • ${data.settings.weeks_per_month} weeks/month • ${data.settings.utilization_percent}% utilization`;
  const visibleTotalMonthlyCents =
    costTypeFilter === "fixed"
      ? data.summary.fixed_monthly_cents
      : costTypeFilter === "variable"
        ? data.summary.variable_monthly_cents
        : data.summary.total_monthly_cents;
  const getVisibleItems = (categoryId: string) =>
    (itemsByCategory.get(categoryId) ?? []).filter(
      (item) => costTypeFilter === "all" || item.cost_type === costTypeFilter,
    );
  const getVisibleCategoryTotal = (categoryId: string) =>
    getVisibleItems(categoryId)
      .filter((item) => item.is_active)
      .reduce((sum, item) => sum + item.monthly_cost_cents, 0);
  const filteredCategories = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return data.categories.filter((category) => {
      if (activeCategoryId !== "all" && category.id !== activeCategoryId) {
        return false;
      }

      const categoryItems = (itemsByCategory.get(category.id) ?? []).filter(
        (item) => costTypeFilter === "all" || item.cost_type === costTypeFilter,
      );

      if (costTypeFilter !== "all" && categoryItems.length === 0) {
        return false;
      }

      if (!query) return true;

      const categoryText = [category.name, category.description ?? ""]
        .join(" ")
        .toLowerCase();
      if (categoryText.includes(query)) return true;

      return categoryItems.some((item) =>
        [item.name, item.notes ?? ""].join(" ").toLowerCase().includes(query),
      );
    });
  }, [activeCategoryId, costTypeFilter, data.categories, itemsByCategory, searchQuery]);
  const topCategoryIds = [...filteredCategories]
    .sort(
      (left, right) =>
        getVisibleCategoryTotal(right.id) - getVisibleCategoryTotal(left.id),
    )
    .slice(0, 3)
    .map((category) => category.id);

  const hasImportedData = importPreview !== null || data.items.length > 0;

  useEffect(() => {
    if (!searchQuery.trim()) return;
    setExpandedCategoryIds((current) => [
      ...new Set([...current, ...filteredCategories.map((category) => category.id)]),
    ]);
  }, [filteredCategories, searchQuery]);

  useEffect(() => {
    if (activeCategoryId === "all") return;
    setExpandedCategoryIds((current) =>
      current.includes(activeCategoryId) ? current : [...current, activeCategoryId],
    );
  }, [activeCategoryId]);

  async function refreshData() {
    const fresh = await getOverheadDashboardData();
    setData(fresh);
  }

  async function handleImportCsv(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    startTransition(async () => {
      const result = await importOverheadCsv(formData);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      setImportPreview(result.preview);

      if (result.imported) {
        await refreshData();
        toast.success(
          `Imported ${result.preview.category_count} categories and ${result.preview.item_count} line items`,
        );
      } else if (result.setupRequired) {
        setData(result.previewData);
        toast.success(
          `Parsed ${result.preview.category_count} categories and ${result.preview.item_count} line items. Apply the overhead migration to save them live.`,
        );
      }
    });

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function saveSettings() {
    if (data.setupRequired) return;

    startTransition(async () => {
      const result = await updateOverheadSettings({
        operatories_count: Number(settingsDraft.operatories_count),
        days_per_week: Number(settingsDraft.days_per_week),
        clinical_hours_per_day: Number(settingsDraft.clinical_hours_per_day),
        weeks_per_month: Number(settingsDraft.weeks_per_month),
        utilization_percent: Number(settingsDraft.utilization_percent),
        notes: settingsDraft.notes.trim() || null,
      });

      if (result?.error) {
        toast.error(readActionError(result.error, "Couldn't save overhead settings"));
        return;
      }

      await refreshData();
      toast.success(`${featureLabel} settings saved`);
    });
  }

  function toggleCategory(categoryId: string) {
    setExpandedCategoryIds((current) =>
      current.includes(categoryId)
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId],
    );
  }

  function expandVisibleCategories() {
    setExpandedCategoryIds((current) => [
      ...new Set([...current, ...filteredCategories.map((category) => category.id)]),
    ]);
  }

  function collapseVisibleCategories() {
    const visibleIds = new Set(filteredCategories.map((category) => category.id));
    setExpandedCategoryIds((current) => current.filter((id) => !visibleIds.has(id)));
  }

  const visibleCategoryIds = filteredCategories.map((category) => category.id);
  const allVisibleExpanded =
    visibleCategoryIds.length > 0 &&
    visibleCategoryIds.every((id) => expandedCategoryIds.includes(id));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{featureLabel}</h1>
          <p className="text-muted-foreground">
            Build a clean monthly overhead model and translate it into cost per operatory hour.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isPending}
          >
            <FileUp className="h-4 w-4" />
            {isPending ? "Importing..." : "Import Sheet"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleImportCsv}
          />

          <CapacitySettingsDialog
            settingsDraft={settingsDraft}
            onSettingsChange={setSettingsDraft}
            onSave={saveSettings}
            isPending={isPending}
            disabled={Boolean(data.setupRequired)}
            summary={capacitySummary}
          />
        </div>
      </div>

      {data.setupRequired && (
        <Card className="border-amber-300/70 bg-amber-50/60">
          <CardHeader>
            <CardTitle className="text-base">Database Setup Needed</CardTitle>
            <CardDescription className="text-amber-900/80">
              The overhead workspace is rendering in preview mode because the new overhead tables have not been applied to your database yet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-amber-950/80">
            <p>What you’re seeing is the real layout and workflow, but edits are temporarily disabled.</p>
            <p>Once migration `043_add_overhead.sql` is applied, this page will become fully live and editable.</p>
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardContent className="grid p-0 md:grid-cols-2 lg:grid-cols-6">
          <SummaryMetric
            icon={<DollarSign className="h-4 w-4" />}
            label="Monthly overhead"
            value={formatCurrencyFromCents(data.summary.total_monthly_cents)}
            detail={`${formatCurrencyFromCents(data.summary.total_annual_cents)} annualized`}
          />
          <SummaryMetric
            icon={<Calculator className="h-4 w-4" />}
            label="Weekly overhead"
            value={formatCurrencyFromCents(data.summary.total_weekly_cents)}
            detail="Annual overhead divided across 52 weeks"
          />
          <SummaryMetric
            icon={<Receipt className="h-4 w-4" />}
            label="Fixed costs"
            value={formatCurrencyFromCents(data.summary.fixed_monthly_cents)}
            detail={`${formatPercentOfTotal(data.summary.fixed_monthly_cents, data.summary.total_monthly_cents)} of overhead`}
          />
          <SummaryMetric
            icon={<Receipt className="h-4 w-4" />}
            label="Variable costs"
            value={formatCurrencyFromCents(data.summary.variable_monthly_cents)}
            detail={`${formatPercentOfTotal(data.summary.variable_monthly_cents, data.summary.total_monthly_cents)} of overhead`}
          />
          <SummaryMetric
            icon={<Calculator className="h-4 w-4" />}
            label="Operatory hours / month"
            value={formatHours(data.summary.configured_monthly_operatory_hours)}
            detail={`${formatHours(data.summary.full_capacity_monthly_operatory_hours)} at full capacity`}
          />
          <SummaryMetric
            icon={<Calculator className="h-4 w-4" />}
            label="Cost per operatory hour"
            value={formatCurrencyFromCents(data.summary.cost_per_operatory_hour_cents)}
            detail={`Full capacity: ${formatCurrencyFromCents(data.summary.full_capacity_cost_per_operatory_hour_cents)}`}
          />
        </CardContent>
      </Card>

      <div className="rounded-xl border bg-muted/20 px-4 py-3">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Current Capacity Assumption
        </div>
        <div className="mt-1 text-sm font-medium">{capacitySummary}</div>
        {data.settings.notes ? (
          <div className="mt-1 text-sm text-muted-foreground">{data.settings.notes}</div>
        ) : null}
      </div>

      {!hasImportedData && data.setupRequired && (
        <Card className="border-dashed">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Import {featureLabel} Sheet</CardTitle>
            <CardDescription>
              Upload your CSV export and map your existing {featureLabel.toLowerCase()} sheet into this workspace instead of rebuilding it by hand.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              This importer is tuned for your numbered categories, line items, monthly amounts, and notes living off to the right.
            </p>
            {data.setupRequired ? (
              <p className="text-xs text-amber-700">
                Preview works now. Saving the import live needs the database migration first.
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="text-base">Categories</CardTitle>
            <CardDescription>
              Expand a category to see its line items, monthly total, notes, and edit actions in one place.
            </CardDescription>
          </div>

          <div className="flex flex-wrap gap-2">
            <CategoryDialog
              featureLabel={featureLabel}
              disabled={Boolean(data.setupRequired)}
              trigger={
                <>
                  <Plus className="h-4 w-4" />
                  Category
                </>
              }
              onSaved={refreshData}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-3 rounded-2xl border bg-muted/15 p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="flex flex-1 items-center gap-2 rounded-xl border bg-background px-3">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search categories or line items"
                  className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                />
              </div>
              <div
                className="grid grid-cols-3 overflow-hidden rounded-lg border bg-background"
                role="group"
                aria-label="Cost type"
              >
                {(["all", "fixed", "variable"] as CostTypeFilter[]).map((costType) => (
                  <Button
                    key={costType}
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setCostTypeFilter(costType)}
                    className={cn(
                      "rounded-none border-r capitalize last:border-r-0",
                      costTypeFilter === costType &&
                        "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                    )}
                  >
                    {costType === "all" ? "All costs" : costType}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-3 lg:flex-1">
                <div className="flex flex-wrap gap-2">
                  <CategoryChip
                    active={activeCategoryId === "all"}
                    onClick={() => setActiveCategoryId("all")}
                  >
                    All categories
                  </CategoryChip>
                  {data.categories.map((category) => (
                    <CategoryChip
                      key={category.id}
                      active={activeCategoryId === category.id}
                      onClick={() => setActiveCategoryId(category.id)}
                    >
                      {category.name}
                    </CategoryChip>
                  ))}
                </div>

                <div className="text-sm text-muted-foreground">
                  {filteredCategories.length} categor{filteredCategories.length === 1 ? "y" : "ies"}
                </div>
              </div>

              {filteredCategories.length > 1 ? (
                <div className="flex justify-end gap-2">
                  {allVisibleExpanded ? (
                    <Button variant="outline" onClick={collapseVisibleCategories}>
                      Collapse All
                    </Button>
                  ) : (
                    <Button variant="outline" onClick={expandVisibleCategories}>
                      Expand All
                    </Button>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          {filteredCategories.map((category) => (
            <CategoryAccordion
              key={category.id}
              category={category}
              items={getVisibleItems(category.id)}
              expanded={expandedCategoryIds.includes(category.id)}
              disabled={Boolean(data.setupRequired)}
              isTopCategory={topCategoryIds.includes(category.id)}
              totalMonthlyCents={visibleTotalMonthlyCents}
              onToggle={() => toggleCategory(category.id)}
              onSaved={refreshData}
              categories={data.categories}
              featureLabel={featureLabel}
            />
          ))}

          {data.categories.length === 0 ? (
            <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              No categories yet. Start with an import or add your first category manually.
            </div>
          ) : filteredCategories.length === 0 ? (
            <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              No categories or line items match this search yet.
            </div>
          ) : null}

        </CardContent>
      </Card>
    </div>
  );
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      size="sm"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function SummaryMetric({
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
    <div className="min-w-0 space-y-2 border-b p-4 md:border-r lg:border-b-0 last:border-b-0 last:border-r-0">
      <div className="flex min-h-8 items-start gap-2 text-muted-foreground">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-xl font-semibold">{value}</div>
      {detail ? <div className="text-xs text-muted-foreground">{detail}</div> : null}
    </div>
  );
}

function formatPercentOfTotal(value: number, total: number) {
  if (total <= 0) return "0%";
  return `${Math.round((value / total) * 100)}%`;
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

function CapacitySettingsDialog({
  settingsDraft,
  onSettingsChange,
  onSave,
  isPending,
  disabled,
  summary,
}: {
  settingsDraft: {
    operatories_count: string;
    days_per_week: string;
    clinical_hours_per_day: string;
    weeks_per_month: string;
    utilization_percent: string;
    notes: string;
  };
  onSettingsChange: Dispatch<
    SetStateAction<{
      operatories_count: string;
      days_per_week: string;
      clinical_hours_per_day: string;
      weeks_per_month: string;
      utilization_percent: string;
      notes: string;
    }>
  >;
  onSave: () => void;
  isPending: boolean;
  disabled: boolean;
  summary: string;
}) {
  return (
    <Dialog>
      <DialogTrigger className={outlineTriggerClassName}>
        <SlidersHorizontal className="h-4 w-4" />
        Capacity Settings
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Capacity Settings</DialogTitle>
          <DialogDescription>
            These numbers turn monthly overhead into cost per operatory hour.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border bg-muted/20 px-4 py-3 text-sm">
            <div className="font-medium">Current setup</div>
            <div className="mt-1 text-muted-foreground">{summary}</div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Operatories"
              value={settingsDraft.operatories_count}
              onChange={(value) =>
                onSettingsChange((draft) => ({ ...draft, operatories_count: value }))
              }
            />
            <Field
              label="Days / week"
              value={settingsDraft.days_per_week}
              onChange={(value) =>
                onSettingsChange((draft) => ({ ...draft, days_per_week: value }))
              }
            />
            <Field
              label="Clinical hrs / day"
              value={settingsDraft.clinical_hours_per_day}
              onChange={(value) =>
                onSettingsChange((draft) => ({ ...draft, clinical_hours_per_day: value }))
              }
            />
            <Field
              label="Weeks / month"
              value={settingsDraft.weeks_per_month}
              onChange={(value) =>
                onSettingsChange((draft) => ({ ...draft, weeks_per_month: value }))
              }
            />
          </div>

          <Field
            label="Utilization %"
            value={settingsDraft.utilization_percent}
            onChange={(value) =>
              onSettingsChange((draft) => ({ ...draft, utilization_percent: value }))
            }
          />

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={settingsDraft.notes}
              onChange={(e) =>
                onSettingsChange((draft) => ({ ...draft, notes: e.target.value }))
              }
              rows={4}
              placeholder="Assumptions, temporary reductions, or how you're thinking about chair capacity."
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose className={dialogSecondaryButtonClassName}>Cancel</DialogClose>
          <Button onClick={onSave} disabled={isPending || disabled}>
            {isPending ? "Saving..." : "Save Capacity Settings"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CategoryAccordion({
  category,
  items,
  expanded,
  disabled,
  isTopCategory,
  totalMonthlyCents,
  onToggle,
  onSaved,
  categories,
  featureLabel,
}: {
  category: OverheadCategorySummary;
  items: OverheadItem[];
  expanded: boolean;
  disabled: boolean;
  isTopCategory: boolean;
  totalMonthlyCents: number;
  onToggle: () => void;
  onSaved: () => Promise<void>;
  categories: OverheadCategorySummary[];
  featureLabel: string;
}) {
  const activeItems = items.filter((item) => item.is_active);
  const categoryMonthlyCents = activeItems.reduce(
    (sum, item) => sum + item.monthly_cost_cents,
    0,
  );
  const sharePercent =
    totalMonthlyCents > 0
      ? Math.round((categoryMonthlyCents / totalMonthlyCents) * 100)
      : 0;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border transition-colors",
        expanded
          ? "border-primary/30 bg-primary/5"
          : isTopCategory
            ? "border-primary/20 bg-primary/[0.03]"
            : "bg-card",
      )}
    >
      <div className="flex items-start gap-3 p-4">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
        >
          <div className="mt-0.5 text-muted-foreground">
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-medium">{category.name}</div>
                  {isTopCategory ? (
                    <Badge variant="outline">Top cost</Badge>
                  ) : null}
                  {sharePercent > 0 ? (
                    <Badge variant="secondary">{sharePercent}% of {featureLabel.toLowerCase()}</Badge>
                  ) : null}
                </div>
                <div className="text-sm text-muted-foreground">
                  {activeItems.length} active item{activeItems.length === 1 ? "" : "s"}
                </div>
                {category.description ? (
                  <div className="mt-2 max-w-3xl text-sm text-muted-foreground">
                    {category.description}
                  </div>
                ) : null}
                {sharePercent > 0 ? (
                  <div className="mt-3 h-2 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        isTopCategory ? "bg-primary" : "bg-muted-foreground/50",
                      )}
                      style={{ width: `${Math.min(sharePercent, 100)}%` }}
                    />
                  </div>
                ) : null}
              </div>

              <div className="text-left sm:text-right">
                <div className="text-lg font-semibold">
                  {formatCurrencyFromCents(categoryMonthlyCents)}
                </div>
                <div className="text-xs text-muted-foreground">Monthly total</div>
              </div>
            </div>
          </div>
        </button>

        <CategoryDialog
          featureLabel={featureLabel}
          editCategory={category}
          disabled={disabled}
          trigger={<Pencil className="h-3.5 w-3.5" />}
          onSaved={onSaved}
        />
      </div>

      {expanded ? (
        <div className="border-t bg-background/80 px-4 py-4">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              Review the line items inside this category and decide what belongs in the monthly model.
            </div>
            <ItemDialog
              featureLabel={featureLabel}
              categories={categories}
              defaultCategoryId={category.id}
              disabled={disabled}
              trigger={
                <>
                  <Plus className="h-4 w-4" />
                  Line Item
                </>
              }
              onSaved={onSaved}
            />
          </div>

          {items.length > 0 ? (
            <div className="overflow-hidden rounded-xl border">
              {items.map((item, index) => (
                <div
                  key={item.id}
                  className={cn(
                    "flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between",
                    index > 0 && "border-t",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{item.name}</div>
                    {item.notes ? (
                      <div className="mt-1 text-sm text-muted-foreground">{item.notes}</div>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-3 sm:justify-end">
                    <div className="min-w-[120px] text-left sm:text-right">
                      <div className="font-medium">
                        {formatCurrencyFromCents(item.monthly_cost_cents)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Order {item.display_order}
                      </div>
                    </div>

                    <Badge variant={item.is_active ? "outline" : "secondary"}>
                      {item.is_active ? "Active" : "Excluded"}
                    </Badge>

                    <Badge variant={item.cost_type === "variable" ? "secondary" : "outline"}>
                      {item.cost_type === "variable" ? "Variable" : "Fixed"}
                    </Badge>

                    <ItemDialog
                      featureLabel={featureLabel}
                      categories={categories}
                      editItem={item}
                      disabled={disabled}
                      trigger={<Pencil className="h-3.5 w-3.5" />}
                      onSaved={onSaved}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              No line items yet in this category.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function CategoryDialog({
  featureLabel,
  trigger,
  editCategory,
  onSaved,
  disabled = false,
}: {
  featureLabel: string;
  trigger: ReactNode;
  editCategory?: OverheadCategorySummary;
  onSaved: () => Promise<void>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(editCategory?.name ?? "");
  const [description, setDescription] = useState(editCategory?.description ?? "");
  const [displayOrder, setDisplayOrder] = useState(String(editCategory?.display_order ?? 0));
  const [isActive, setIsActive] = useState(editCategory?.is_active ?? true);

  function syncFromEditCategory() {
    setName(editCategory?.name ?? "");
    setDescription(editCategory?.description ?? "");
    setDisplayOrder(String(editCategory?.display_order ?? 0));
    setIsActive(editCategory?.is_active ?? true);
  }

  async function handleSubmit() {
    setLoading(true);
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      display_order: Number(displayOrder || 0),
      is_active: isActive,
    };

    const result = editCategory
      ? await updateOverheadCategory(editCategory.id, payload)
      : await createOverheadCategory(payload);

    if (result?.error) {
      toast.error(readActionError(result.error, "Couldn't save category"));
      setLoading(false);
      return;
    }

    await onSaved();
    toast.success(editCategory ? "Category updated" : "Category created");
    setOpen(false);
    if (!editCategory) syncFromEditCategory();
    setLoading(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) syncFromEditCategory();
      }}
    >
      <DialogTrigger
        className={editCategory ? editTriggerClassName : buttonTriggerClassName}
        disabled={disabled}
      >
        {trigger}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editCategory ? `Edit ${featureLabel} Category` : `Add ${featureLabel} Category`}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What belongs in this category?"
            />
          </div>
          <div className="space-y-2">
            <Label>Display order</Label>
            <Input
              type="number"
              min="0"
              value={displayOrder}
              onChange={(e) => setDisplayOrder(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Include this category in the model
          </label>
        </div>
        <DialogFooter>
          <DialogClose className={dialogSecondaryButtonClassName}>Cancel</DialogClose>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Saving..." : editCategory ? "Save Changes" : "Create Category"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ItemDialog({
  featureLabel,
  categories,
  trigger,
  defaultCategoryId,
  editItem,
  onSaved,
  disabled = false,
}: {
  featureLabel: string;
  categories: OverheadCategorySummary[];
  trigger: ReactNode;
  defaultCategoryId?: string;
  editItem?: OverheadItem;
  onSaved: () => Promise<void>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [categoryId, setCategoryId] = useState(
    editItem?.category_id ?? defaultCategoryId ?? "",
  );
  const [name, setName] = useState(editItem?.name ?? "");
  const [monthlyCost, setMonthlyCost] = useState(
    editItem ? String(editItem.monthly_cost_cents / 100) : "",
  );
  const [notes, setNotes] = useState(editItem?.notes ?? "");
  const [displayOrder, setDisplayOrder] = useState(String(editItem?.display_order ?? 0));
  const [isActive, setIsActive] = useState(editItem?.is_active ?? true);
  const [costType, setCostType] = useState<"fixed" | "variable">(
    editItem?.cost_type ?? "fixed",
  );

  function syncFromSource() {
    setCategoryId(editItem?.category_id ?? defaultCategoryId ?? categories[0]?.id ?? "");
    setName(editItem?.name ?? "");
    setMonthlyCost(editItem ? String(editItem.monthly_cost_cents / 100) : "");
    setNotes(editItem?.notes ?? "");
    setDisplayOrder(String(editItem?.display_order ?? 0));
    setIsActive(editItem?.is_active ?? true);
    setCostType(editItem?.cost_type ?? "fixed");
  }

  async function handleSubmit() {
    setLoading(true);
    const payload = {
      category_id: categoryId,
      name: name.trim(),
      monthly_cost_cents: parseDollarAmountToCents(monthlyCost),
      notes: notes.trim() || null,
      display_order: Number(displayOrder || 0),
      is_active: isActive,
      cost_type: costType,
    };

    const result = editItem
      ? await updateOverheadItem(editItem.id, payload)
      : await createOverheadItem(payload);

    if (result?.error) {
      toast.error(readActionError(result.error, "Couldn't save line item"));
      setLoading(false);
      return;
    }

    await onSaved();
    toast.success(editItem ? "Line item updated" : "Line item created");
    setOpen(false);
    if (!editItem) syncFromSource();
    setLoading(false);
  }

  async function handleDelete() {
    if (!editItem) return;
    if (!window.confirm(`Delete "${editItem.name}"? This can't be undone.`)) {
      return;
    }

    setLoading(true);
    const result = await deleteOverheadItem(editItem.id);

    if (result?.error) {
      toast.error(readActionError(result.error, "Couldn't delete line item"));
      setLoading(false);
      return;
    }

    await onSaved();
    toast.success("Line item deleted");
    setOpen(false);
    setLoading(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) syncFromSource();
      }}
    >
      <DialogTrigger
        className={editItem ? editTriggerClassName : buttonTriggerClassName}
        disabled={disabled}
      >
        {trigger}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editItem ? `Edit ${featureLabel} Line Item` : `Add ${featureLabel} Line Item`}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={categoryId} onValueChange={(value) => value && setCategoryId(value)}>
              <SelectTrigger>
                <span>
                  {categories.find((category) => category.id === categoryId)?.name ??
                    "Select a category"}
                </span>
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Line item name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Monthly cost</Label>
              <Input
                value={monthlyCost}
                onChange={(e) => setMonthlyCost(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label>Display order</Label>
              <Input
                type="number"
                min="0"
                value={displayOrder}
                onChange={(e) => setDisplayOrder(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Cost behavior</Label>
            <div
              className="grid grid-cols-2 overflow-hidden rounded-lg border"
              role="group"
              aria-label="Cost behavior"
            >
              {(["fixed", "variable"] as const).map((type) => (
                <Button
                  key={type}
                  type="button"
                  variant="ghost"
                  onClick={() => setCostType(type)}
                  className={cn(
                    "rounded-none border-r capitalize last:border-r-0",
                    costType === type &&
                      "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                  )}
                >
                  {type}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything useful from the original sheet or your current assumption."
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Include this line item in monthly overhead
          </label>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {editItem ? (
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={loading}
            >
              <Trash2 className="h-4 w-4" />
              Delete Line Item
            </Button>
          ) : (
            <span />
          )}
          <div className="flex justify-end gap-2">
            <DialogClose className={dialogSecondaryButtonClassName}>Cancel</DialogClose>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? "Saving..." : editItem ? "Save Changes" : "Create Line Item"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function readActionError(
  error: string | Record<string, string[] | undefined>,
  fallback: string,
) {
  if (typeof error === "string") return error;
  const firstFieldError = Object.values(error).flat().find(Boolean);
  return firstFieldError ?? fallback;
}

const buttonTriggerClassName =
  "inline-flex items-center justify-center gap-1 rounded-lg border border-transparent bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80 disabled:pointer-events-none disabled:opacity-50";

const outlineTriggerClassName =
  "inline-flex items-center justify-center gap-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50";

const editTriggerClassName =
  "inline-flex items-center justify-center rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50";

const dialogSecondaryButtonClassName =
  "inline-flex items-center justify-center rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted";
