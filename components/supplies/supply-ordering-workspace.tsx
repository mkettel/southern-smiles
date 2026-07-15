"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  CalendarDays,
  ExternalLink,
  FlaskConical,
  Grid2X2,
  LockKeyhole,
  Minus,
  PackagePlus,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCcw,
  Scissors,
  Search,
  ShoppingCart,
  Smile,
  SprayCan,
  Target,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCurrency, parseDollarAmountToCents, todayString } from "@/lib/bills";
import {
  calculateSupplyBudgetCents,
  createSupplyId,
  DEFAULT_SUPPLY_BUDGET_SETTINGS,
  DEFAULT_SUPPLY_CATALOG,
  SUPPLY_CATALOG_GROUP_META,
  SUPPLY_CATEGORY_META,
  type SupplyBudgetSettings,
  type SupplyCatalogItem,
  type SupplyCatalogGroup,
  type SupplyCategory,
  type SupplyOrderDraftLine,
  type SupplyPurchase,
} from "@/lib/supply-ordering";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "supply-ordering-workspace-v1";
const LEGACY_DEMO_IDS = new Set([
  "patient-bib",
  "pip-paste",
  "pip-brush",
  "locator-abutments-inserts",
]);

const CATALOG_FILTERS = [
  { value: "all", label: "All supplies", compactLabel: "All", icon: Grid2X2 },
  { value: "lab", label: "Lab Supplies", compactLabel: "Lab", icon: FlaskConical },
  { value: "office_cleaning", label: "Office / Cleaning", compactLabel: "Office", icon: SprayCan },
  { value: "general", label: "General Supplies", compactLabel: "General", icon: Boxes },
  { value: "oral_surgery", label: "Oral Surgery", compactLabel: "Surgery", icon: Scissors },
  { value: "ortho", label: "Ortho", compactLabel: "Ortho", icon: Smile },
] as const;

type ActiveTab = "overview" | "catalog" | "order-draft" | "purchases" | "cost-impact";

interface SavedSupplyWorkspace {
  catalog: SupplyCatalogItem[];
  purchases: SupplyPurchase[];
  settings: SupplyBudgetSettings;
  orderDraft?: SupplyOrderDraftLine[];
}

interface SupplyOrderingWorkspaceProps {
  canManageBudget?: boolean;
}

function moneyInputValue(cents: number) {
  return (cents / 100).toFixed(2);
}

function formatBudgetMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return month;
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
    new Date(year, monthNumber - 1, 1),
  );
}

function isSupplyWorkspace(value: unknown): value is SavedSupplyWorkspace {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SavedSupplyWorkspace>;
  return (
    Array.isArray(candidate.catalog) &&
    Array.isArray(candidate.purchases) &&
    Boolean(candidate.settings)
  );
}

function normalizeCatalogItem(item: SupplyCatalogItem): SupplyCatalogItem {
  return {
    ...item,
    catalog_group: item.catalog_group ?? (item.category === "office" ? "office_cleaning" : "general"),
    alternative_urls: item.alternative_urls ?? [],
    last_price_note: item.last_price_note ?? null,
  };
}

function normalizeSettings(settings: SupplyBudgetSettings): SupplyBudgetSettings {
  return {
    ...DEFAULT_SUPPLY_BUDGET_SETTINGS,
    ...settings,
  };
}

function isLegacyDemoCatalog(catalog: SupplyCatalogItem[]) {
  return catalog.length === LEGACY_DEMO_IDS.size && catalog.every((item) => LEGACY_DEMO_IDS.has(item.id));
}

function defaultBudgetTreatment(item: SupplyCatalogItem | undefined): SupplyCategory {
  if (item?.category === "implant_graft") return "implant_graft";
  return item?.catalog_group === "office_cleaning" ? "office" : "routine";
}

export function SupplyOrderingWorkspace({
  canManageBudget = true,
}: SupplyOrderingWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
  const [catalog, setCatalog] = useState<SupplyCatalogItem[]>(DEFAULT_SUPPLY_CATALOG);
  const [purchases, setPurchases] = useState<SupplyPurchase[]>([]);
  const [orderDraft, setOrderDraft] = useState<SupplyOrderDraftLine[]>([]);
  const [settings, setSettings] = useState<SupplyBudgetSettings>(
    DEFAULT_SUPPLY_BUDGET_SETTINGS,
  );
  const [hasHydrated, setHasHydrated] = useState(false);
  const [catalogDialogOpen, setCatalogDialogOpen] = useState(false);
  const [catalogItemToEdit, setCatalogItemToEdit] = useState<SupplyCatalogItem | null>(null);
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);
  const [selectedCatalogItemId, setSelectedCatalogItemId] = useState(
    DEFAULT_SUPPLY_CATALOG[0]?.id ?? "",
  );
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogGroupFilter, setCatalogGroupFilter] = useState<SupplyCatalogGroup | "all">("all");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as unknown;
        if (isSupplyWorkspace(parsed)) {
          const restoredCatalog = isLegacyDemoCatalog(parsed.catalog)
            ? DEFAULT_SUPPLY_CATALOG
            : parsed.catalog.map(normalizeCatalogItem);
          setCatalog(restoredCatalog);
          setPurchases(parsed.purchases);
          setOrderDraft(parsed.orderDraft ?? []);
          setSettings(normalizeSettings(parsed.settings));
          setSelectedCatalogItemId(restoredCatalog[0]?.id ?? "");
        }
      }
    } catch {
      // A damaged local draft should never keep the workspace from opening.
    } finally {
      setHasHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ catalog, purchases, settings, orderDraft } satisfies SavedSupplyWorkspace),
    );
  }, [catalog, hasHydrated, orderDraft, purchases, settings]);

  const budget = useMemo(() => {
    const routineCents = calculateSupplyBudgetCents(
      settings.collections_cents,
      settings.routine_target_percent,
    );
    const officeCents = calculateSupplyBudgetCents(
      settings.collections_cents,
      settings.office_target_percent,
    );
    return {
      routineCents,
      officeCents,
      combinedCents: routineCents + officeCents,
    };
  }, [settings]);

  const purchaseTotals = useMemo(() => {
    return purchases.reduce(
      (totals, purchase) => {
        const amountCents = purchase.quantity * purchase.unit_cost_cents;
        totals[purchase.category] += amountCents;
        return totals;
      },
      { routine: 0, office: 0, implant_graft: 0 } as Record<SupplyCategory, number>,
    );
  }, [purchases]);

  const filteredCatalog = useMemo(() => {
    const normalizedQuery = catalogQuery.trim().toLowerCase();
    return catalog.filter((item) => {
      if (catalogGroupFilter !== "all" && item.catalog_group !== catalogGroupFilter) return false;
      if (!normalizedQuery) return true;
      return `${item.name} ${item.vendor} ${SUPPLY_CATALOG_GROUP_META[item.catalog_group].label} ${item.procedure_links.map((link) => link.procedure_name).join(" ")}`
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [catalog, catalogGroupFilter, catalogQuery]);

  const impactRows = useMemo(() => {
    return catalog.flatMap((item) => {
      const unitCostCents = item.current_unit_cost_cents;
      if (unitCostCents === null) return [];
      return item.procedure_links.map((link) => ({
        id: `${item.id}-${link.procedure_name}`,
        item,
        procedureName: link.procedure_name,
        units: link.units_per_procedure,
        unitCostCents,
        costCents: unitCostCents * link.units_per_procedure,
      }));
    });
  }, [catalog]);

  const recentPurchases = useMemo(
    () => [...purchases].sort((a, b) => b.purchased_at.localeCompare(a.purchased_at)),
    [purchases],
  );

  function openPurchaseDialog(itemId?: string) {
    setSelectedCatalogItemId(itemId ?? catalog[0]?.id ?? "");
    setPurchaseDialogOpen(true);
  }

  function openCatalogItemDialog(item?: SupplyCatalogItem) {
    setCatalogItemToEdit(item ?? null);
    setCatalogDialogOpen(true);
  }

  function addToOrderDraft(itemId: string) {
    const item = catalog.find((catalogItem) => catalogItem.id === itemId);
    if (!item) return;

    setOrderDraft((current) => {
      const existing = current.find(
        (line) => line.catalog_item_id === item.id && line.vendor === item.vendor,
      );
      if (existing) {
        return current.map((line) =>
          line.id === existing.id ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [
        ...current,
        {
          id: createSupplyId("order"),
          catalog_item_id: item.id,
          vendor: item.vendor,
          quantity: 1,
          added_at: todayString(),
        },
      ];
    });
    toast.success(`${item.name} added to the order draft`);
  }

  function updateOrderDraftQuantity(lineId: string, quantity: number) {
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    setOrderDraft((current) =>
      current.map((line) => line.id === lineId ? { ...line, quantity } : line),
    );
  }

  function removeFromOrderDraft(lineId: string) {
    setOrderDraft((current) => current.filter((line) => line.id !== lineId));
  }

  function openVendorProductPages(vendor: string) {
    const links = orderDraft
      .filter((line) => line.vendor === vendor)
      .map((line) => catalog.find((item) => item.id === line.catalog_item_id)?.product_url)
      .filter((url): url is string => Boolean(url));

    if (!links.length) {
      toast.error("Add a product link before opening this vendor order");
      return;
    }

    links.forEach((url) => window.open(url, "_blank", "noopener,noreferrer"));
    toast.success(`${links.length} product page${links.length === 1 ? "" : "s"} opened for ${vendor}`);
  }

  function markVendorOrderPlaced(vendor: string) {
    const lines = orderDraft.filter((line) => line.vendor === vendor);
    const missingPriceItems = lines
      .map((line) => catalog.find((item) => item.id === line.catalog_item_id))
      .filter((item): item is SupplyCatalogItem => Boolean(item && item.current_unit_cost_cents === null));

    if (missingPriceItems.length) {
      toast.error(
        `Add a package price for ${missingPriceItems[0].name}${missingPriceItems.length > 1 ? " and the other unpriced item" : ""} first`,
      );
      return;
    }

    const newPurchases = lines.flatMap((line) => {
      const item = catalog.find((catalogItem) => catalogItem.id === line.catalog_item_id);
      if (!item || item.current_unit_cost_cents === null) return [];
      return [{
        id: createSupplyId("purchase"),
        catalog_item_id: item.id,
        vendor,
        purchased_at: todayString(),
        quantity: line.quantity,
        unit_cost_cents: item.current_unit_cost_cents,
        category: defaultBudgetTreatment(item),
        case_reference: null,
        notes: "Logged from order draft",
      } satisfies SupplyPurchase];
    });

    setPurchases((current) => [...newPurchases, ...current]);
    setCatalog((current) =>
      current.map((item) =>
        lines.some((line) => line.catalog_item_id === item.id)
          ? { ...item, vendor, updated_at: todayString() }
          : item,
      ),
    );
    setOrderDraft((current) => current.filter((line) => line.vendor !== vendor));
    toast.success(`${vendor} order logged with ${newPurchases.length} item${newPurchases.length === 1 ? "" : "s"}`);
  }

  function resetDraft() {
    setCatalog(DEFAULT_SUPPLY_CATALOG);
    setPurchases([]);
    setOrderDraft([]);
    setSettings(DEFAULT_SUPPLY_BUDGET_SETTINGS);
    setSelectedCatalogItemId(DEFAULT_SUPPLY_CATALOG[0]?.id ?? "");
    toast.success("Local supply draft reset");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <ShoppingCart className="h-4 w-4" />
            Supply ordering draft
          </div>
          <h1 className="mt-1 text-2xl font-bold">Supply Ordering</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Keep one price-aware catalog organized the way Lisa already works, then build each
            vendor order before it is placed.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={resetDraft}>
            <RefreshCcw className="h-4 w-4" />
            Reset draft
          </Button>
          <Button variant="outline" onClick={() => openCatalogItemDialog()}>
            <PackagePlus className="h-4 w-4" />
            Catalog item
          </Button>
          <Button onClick={() => setActiveTab("order-draft")}>
            <ShoppingCart className="h-4 w-4" />
            Order draft{orderDraft.length ? ` (${orderDraft.length})` : ""}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ActiveTab)}>
        <TabsList variant="line" className="w-full justify-start overflow-x-auto border-b">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="catalog">Supply catalog</TabsTrigger>
          <TabsTrigger value="order-draft">
            Order draft{orderDraft.length ? ` (${orderDraft.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="purchases">Purchase log</TabsTrigger>
          <TabsTrigger value="cost-impact">Procedure impact</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-6">
          <OverviewTab
            budget={budget}
            purchaseTotals={purchaseTotals}
            settings={settings}
            onSettingsChange={setSettings}
            canManageBudget={canManageBudget}
            onLogPurchase={() => openPurchaseDialog()}
            recentPurchases={recentPurchases}
            catalog={catalog}
          />
        </TabsContent>

        <TabsContent value="catalog" className="pt-6">
          <CatalogTab
            catalog={filteredCatalog}
            catalogGroupFilter={catalogGroupFilter}
            query={catalogQuery}
            onCatalogGroupFilterChange={setCatalogGroupFilter}
            onQueryChange={setCatalogQuery}
            onAddToOrder={addToOrderDraft}
            onAddItem={() => openCatalogItemDialog()}
            onEditItem={openCatalogItemDialog}
          />
        </TabsContent>

        <TabsContent value="order-draft" className="pt-6">
          <OrderDraftTab
            orderDraft={orderDraft}
            catalog={catalog}
            onQuantityChange={updateOrderDraftQuantity}
            onRemove={removeFromOrderDraft}
            onOpenVendorProductPages={openVendorProductPages}
            onMarkVendorOrderPlaced={markVendorOrderPlaced}
            onBrowseCatalog={() => setActiveTab("catalog")}
            onEditItem={openCatalogItemDialog}
          />
        </TabsContent>

        <TabsContent value="purchases" className="pt-6">
          <PurchaseLogTab
            purchases={recentPurchases}
            catalog={catalog}
            onLogPurchase={() => openPurchaseDialog()}
          />
        </TabsContent>

        <TabsContent value="cost-impact" className="pt-6">
          <CostImpactTab impactRows={impactRows} onLogPurchase={openPurchaseDialog} />
        </TabsContent>
      </Tabs>

      <CatalogItemDialog
        key={catalogItemToEdit?.id ?? "new-item"}
        open={catalogDialogOpen}
        item={catalogItemToEdit}
        onOpenChange={(open) => {
          setCatalogDialogOpen(open);
          if (!open) setCatalogItemToEdit(null);
        }}
        onSave={(item) => {
          setCatalog((current) =>
            catalogItemToEdit
              ? current.map((currentItem) => currentItem.id === item.id ? item : currentItem)
              : [...current, item],
          );
          setSelectedCatalogItemId(item.id);
          setCatalogDialogOpen(false);
          setCatalogItemToEdit(null);
          toast.success(catalogItemToEdit ? "Catalog item updated" : "Catalog item added");
        }}
      />

      <PurchaseDialog
        key={`purchase-${purchaseDialogOpen}-${selectedCatalogItemId}`}
        open={purchaseDialogOpen}
        onOpenChange={setPurchaseDialogOpen}
        catalog={catalog}
        selectedCatalogItemId={selectedCatalogItemId}
        onSave={(purchase) => {
          setPurchases((current) => [purchase, ...current]);
          setCatalog((current) =>
            current.map((item) => {
              if (item.id !== purchase.catalog_item_id) return item;
              const priceChanged = item.current_unit_cost_cents !== purchase.unit_cost_cents;
              return {
                ...item,
                vendor: purchase.vendor.trim() || item.vendor,
                prior_unit_cost_cents: priceChanged ? item.current_unit_cost_cents : item.prior_unit_cost_cents,
                current_unit_cost_cents: purchase.unit_cost_cents,
                updated_at: purchase.purchased_at,
              };
            }),
          );
          setPurchaseDialogOpen(false);
          toast.success("Purchase logged and catalog price updated");
        }}
      />
    </div>
  );
}

function OverviewTab({
  budget,
  purchaseTotals,
  settings,
  onSettingsChange,
  canManageBudget,
  onLogPurchase,
  recentPurchases,
  catalog,
}: {
  budget: { routineCents: number; officeCents: number; combinedCents: number };
  purchaseTotals: Record<SupplyCategory, number>;
  settings: SupplyBudgetSettings;
  onSettingsChange: (settings: SupplyBudgetSettings) => void;
  canManageBudget: boolean;
  onLogPurchase: () => void;
  recentPurchases: SupplyPurchase[];
  catalog: SupplyCatalogItem[];
}) {
  const loggedOperatingSpend = purchaseTotals.routine + purchaseTotals.office;
  const operatingRemaining = budget.combinedCents - loggedOperatingSpend;
  const budgetMonth = formatBudgetMonth(settings.budget_month);

  function updateBudget(next: Partial<SupplyBudgetSettings>) {
    onSettingsChange({
      ...settings,
      ...next,
      published_at: null,
      published_by: null,
    });
  }

  function publishBudget() {
    onSettingsChange({
      ...settings,
      published_at: todayString(),
      published_by: "Dr. Monzer Shakally",
    });
    toast.success(`${budgetMonth} budget published to the supply officer`);
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <MetricCard
          icon={<Target className="h-4 w-4" />}
          label={`${budgetMonth} operating budget`}
          value={formatCurrency(budget.combinedCents)}
          detail={`${settings.routine_target_percent}% routine + ${settings.office_target_percent}% office`}
        />
        <MetricCard
          icon={<ReceiptText className="h-4 w-4" />}
          label="Logged operating spend"
          value={formatCurrency(loggedOperatingSpend)}
          detail={
            recentPurchases.length
              ? `${recentPurchases.length} purchase${recentPurchases.length === 1 ? "" : "s"} in this draft`
              : "No purchases logged yet"
          }
          tone={loggedOperatingSpend > budget.combinedCents ? "danger" : "default"}
        />
        <MetricCard
          icon={<Boxes className="h-4 w-4" />}
          label="Implant & graft purchases"
          value={formatCurrency(purchaseTotals.implant_graft)}
          detail="Tracked per planned case, outside operating budget"
          tone="accent"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,0.9fr)]">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base">Current budget lane</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                The temporary budget is tied to rolling collections. Implants and grafts are not
                counted here.
              </p>
            </div>
            <Button size="sm" onClick={onLogPurchase}>
              <Plus className="h-4 w-4" />
              Purchase
            </Button>
          </CardHeader>
          <CardContent className="space-y-5">
            <BudgetLane
              label="Routine clinical"
              targetPercent={settings.routine_target_percent}
              budgetCents={budget.routineCents}
              baselineCents={settings.routine_baseline_cents}
              loggedCents={purchaseTotals.routine}
              color="sky"
            />
            <BudgetLane
              label="Office supplies"
              targetPercent={settings.office_target_percent}
              budgetCents={budget.officeCents}
              baselineCents={settings.office_baseline_cents}
              loggedCents={purchaseTotals.office}
              color="amber"
            />
            <div className="flex items-center justify-between border-t pt-4 text-sm">
              <span className="text-muted-foreground">Operating budget remaining</span>
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  operatingRemaining < 0 ? "text-destructive" : "text-foreground",
                )}
              >
                {formatCurrency(Math.abs(operatingRemaining))}
                {operatingRemaining < 0 ? " over" : " remaining"}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base">Monthly budget</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Set by an admin in the first week, then visible read-only to the supply officer.
              </p>
            </div>
            <Badge variant="outline" className="gap-1.5">
              <LockKeyhole className="h-3 w-3" />
              Admin only
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            {canManageBudget ? (
              <>
                <div>
                  <Label className="mb-1.5">Budget month</Label>
                  <Input
                    type="month"
                    value={settings.budget_month}
                    onChange={(event) => updateBudget({ budget_month: event.target.value })}
                  />
                </div>
                <DollarField
                  label="Rolling 3-month collections"
                  cents={settings.collections_cents}
                  onChange={(collections_cents) => updateBudget({ collections_cents })}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <PercentField
                    label="Routine target"
                    value={settings.routine_target_percent}
                    onChange={(routine_target_percent) => updateBudget({ routine_target_percent })}
                  />
                  <PercentField
                    label="Office target"
                    value={settings.office_target_percent}
                    onChange={(office_target_percent) => updateBudget({ office_target_percent })}
                  />
                </div>
                <Button className="w-full" onClick={publishBudget}>
                  <CalendarDays className="h-4 w-4" />
                  Publish {budgetMonth} budget
                </Button>
              </>
            ) : (
              <div className="space-y-3 rounded-lg border bg-muted/30 p-4 text-sm">
                <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Budget month</span><span className="font-medium">{budgetMonth}</span></div>
                <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Rolling collections</span><span className="font-medium tabular-nums">{formatCurrency(settings.collections_cents)}</span></div>
                <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Operating target</span><span className="font-medium">{settings.routine_target_percent}% routine + {settings.office_target_percent}% office</span></div>
              </div>
            )}
            <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
              {settings.published_at
                ? `Published ${settings.published_at} by ${settings.published_by ?? "an admin"}.`
                : "Changes are waiting to be published to the supply officer."} Current baseline: {formatCurrency(settings.routine_baseline_cents)} routine and {formatCurrency(settings.office_baseline_cents)} office. The intended long-term targets are 4% and 1.25% after the transition period.
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base">Start-of-day checklist</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              The workflow stays deliberately small: catalog, purchase, price, and purpose.
            </p>
          </div>
          <Badge variant="outline">{catalog.length} catalog items</Badge>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            <ChecklistStep number="1" title="Pick the catalog item" detail="Use an existing item or add it once." />
            <ChecklistStep number="2" title="Log the order" detail="Vendor, packages, price, and budget treatment." />
            <ChecklistStep number="3" title="Tag major materials" detail="Use a non-identifying case reference for implants or grafts." />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CatalogTab({
  catalog,
  catalogGroupFilter,
  query,
  onCatalogGroupFilterChange,
  onQueryChange,
  onAddToOrder,
  onAddItem,
  onEditItem,
}: {
  catalog: SupplyCatalogItem[];
  catalogGroupFilter: SupplyCatalogGroup | "all";
  query: string;
  onCatalogGroupFilterChange: (value: SupplyCatalogGroup | "all") => void;
  onQueryChange: (value: string) => void;
  onAddToOrder: (itemId: string) => void;
  onAddItem: () => void;
  onEditItem: (item: SupplyCatalogItem) => void;
}) {
  return (
    <Card>
      <CardHeader className="gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <CardTitle className="text-base">Supply catalog</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Categories mirror Lisa&apos;s supply list. Add needed items to an order draft, grouped by
            vendor.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onAddItem}>
            <PackagePlus className="h-4 w-4" />
            Catalog item
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              className="w-full pl-9 sm:w-64"
              placeholder="Search supplies"
            />
          </div>
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto pb-1 sm:flex-none">
            {CATALOG_FILTERS.map((filter) => {
              const Icon = filter.icon;
              const isSelected = catalogGroupFilter === filter.value;
              return (
                <Tooltip key={filter.value}>
                  <TooltipTrigger
                    type="button"
                    aria-pressed={isSelected}
                    aria-label={filter.label}
                    onClick={() => onCatalogGroupFilterChange(filter.value)}
                    className={cn(
                      "flex h-12 w-[62px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border text-[10px] font-medium transition-colors",
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{filter.compactLabel}</span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{filter.label}</TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Item</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Last package price</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Procedure use</th>
                <th className="px-4 py-3 font-medium">Reorder level</th>
                <th className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {catalog.map((item) => (
                <tr key={item.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="font-medium">{item.name}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">Last purchased from {item.vendor}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{SUPPLY_CATALOG_GROUP_META[item.catalog_group].label}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium tabular-nums">{formatLastPrice(item)}</div>
                    <PriceChange current={item.current_unit_cost_cents} prior={item.prior_unit_cost_cents} />
                  </td>
                  <td className="px-4 py-3">
                    {item.product_url ? (
                      <a className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline" href={item.product_url} target="_blank" rel="noreferrer">
                        Product link <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : <span className="text-xs text-muted-foreground">Add link</span>}
                    {item.alternative_urls.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{item.alternative_urls.length} alternative{item.alternative_urls.length === 1 ? "" : "s"}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {item.procedure_links.length ? item.procedure_links.map((link) => `${link.procedure_name} (${link.units_per_procedure})`).join(", ") : "Not linked yet"}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{item.reorder_level > 0 ? `${item.reorder_level} ${item.unit_label}` : "Not set"}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Tooltip>
                        <TooltipTrigger
                          type="button"
                          aria-label={`Edit ${item.name}`}
                          onClick={() => onEditItem(item)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <Pencil className="h-4 w-4" />
                        </TooltipTrigger>
                        <TooltipContent side="top">Edit item</TooltipContent>
                      </Tooltip>
                      <Button variant="outline" size="sm" onClick={() => onAddToOrder(item.id)}>
                        <ShoppingCart className="h-4 w-4" />
                        Add to order
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!catalog.length && <div className="p-8 text-center text-sm text-muted-foreground">No supply items match this view.</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function OrderDraftTab({
  orderDraft,
  catalog,
  onQuantityChange,
  onRemove,
  onOpenVendorProductPages,
  onMarkVendorOrderPlaced,
  onBrowseCatalog,
  onEditItem,
}: {
  orderDraft: SupplyOrderDraftLine[];
  catalog: SupplyCatalogItem[];
  onQuantityChange: (lineId: string, quantity: number) => void;
  onRemove: (lineId: string) => void;
  onOpenVendorProductPages: (vendor: string) => void;
  onMarkVendorOrderPlaced: (vendor: string) => void;
  onBrowseCatalog: () => void;
  onEditItem: (item: SupplyCatalogItem) => void;
}) {
  const itemById = new Map(catalog.map((item) => [item.id, item]));
  const vendorOrders = new Map<string, Array<{ line: SupplyOrderDraftLine; item: SupplyCatalogItem }>>();

  for (const line of orderDraft) {
    const item = itemById.get(line.catalog_item_id);
    if (!item) continue;
    vendorOrders.set(line.vendor, [...(vendorOrders.get(line.vendor) ?? []), { line, item }]);
  }

  const groupedOrders = [...vendorOrders.entries()].sort(([firstVendor], [secondVendor]) =>
    firstVendor.localeCompare(secondVendor),
  );
  const totalPackages = orderDraft.reduce((total, line) => total + line.quantity, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Order draft</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {orderDraft.length
              ? `${totalPackages} package${totalPackages === 1 ? "" : "s"} across ${groupedOrders.length} vendor${groupedOrders.length === 1 ? "" : "s"}`
              : "Add supplies from the catalog when they need to be ordered."}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onBrowseCatalog}>
          <Plus className="h-4 w-4" />
          Add supplies
        </Button>
      </div>

      {!groupedOrders.length ? (
        <Card>
          <CardContent className="flex min-h-64 flex-col items-center justify-center text-center">
            <ShoppingCart className="mb-3 h-9 w-9 text-muted-foreground" />
            <p className="font-medium">Your order draft is empty</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Use the catalog to collect what needs to be ordered this week.
            </p>
            <Button className="mt-4" onClick={onBrowseCatalog}>
              Browse supplies
            </Button>
          </CardContent>
        </Card>
      ) : (
        groupedOrders.map(([vendor, lines]) => {
          const productLinkCount = lines.filter(({ item }) => Boolean(item.product_url)).length;
          const missingPriceCount = lines.filter(
            ({ item }) => item.current_unit_cost_cents === null,
          ).length;
          const estimatedTotal = lines.reduce(
            (total, { line, item }) => total + (item.current_unit_cost_cents ?? 0) * line.quantity,
            0,
          );

          return (
            <Card key={vendor}>
              <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle className="text-base">{vendor}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {lines.length} item{lines.length === 1 ? "" : "s"} · expected total {formatCurrency(estimatedTotal)}
                    {missingPriceCount ? ` · ${missingPriceCount} price${missingPriceCount === 1 ? "" : "s"} needed` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!productLinkCount}
                    onClick={() => onOpenVendorProductPages(vendor)}
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open {productLinkCount} item page{productLinkCount === 1 ? "" : "s"}
                  </Button>
                  <Button
                    size="sm"
                    disabled={Boolean(missingPriceCount)}
                    onClick={() => onMarkVendorOrderPlaced(vendor)}
                  >
                    <ReceiptText className="h-4 w-4" />
                    Mark ordered
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[700px] text-sm">
                    <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium">Item</th>
                        <th className="px-4 py-3 font-medium">Quantity</th>
                        <th className="px-4 py-3 font-medium">Saved price</th>
                        <th className="px-4 py-3 font-medium">Expected total</th>
                        <th className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {lines.map(({ line, item }) => {
                        const hasPrice = item.current_unit_cost_cents !== null;
                        return (
                          <tr key={line.id}>
                            <td className="px-4 py-3">
                              <div className="font-medium">{item.name}</div>
                              <div className="mt-0.5 text-xs text-muted-foreground">
                                {SUPPLY_CATALOG_GROUP_META[item.catalog_group].label}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex w-28 items-center rounded-md border bg-background">
                                <Tooltip>
                                  <TooltipTrigger
                                    type="button"
                                    aria-label={`Decrease ${item.name} quantity`}
                                    onClick={() => onQuantityChange(line.id, Math.max(1, line.quantity - 1))}
                                    className="inline-flex h-8 w-8 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
                                  >
                                    <Minus className="h-3.5 w-3.5" />
                                  </TooltipTrigger>
                                  <TooltipContent side="top">One fewer package</TooltipContent>
                                </Tooltip>
                                <Input
                                  key={`${line.id}-${line.quantity}`}
                                  defaultValue={String(line.quantity)}
                                  inputMode="numeric"
                                  aria-label={`${item.name} quantity`}
                                  className="h-8 w-12 rounded-none border-0 px-1 text-center tabular-nums shadow-none focus-visible:ring-0"
                                  onBlur={(event) => {
                                    const nextQuantity = Number(event.target.value);
                                    onQuantityChange(line.id, Math.max(1, Number.isFinite(nextQuantity) ? nextQuantity : 1));
                                  }}
                                />
                                <Tooltip>
                                  <TooltipTrigger
                                    type="button"
                                    aria-label={`Increase ${item.name} quantity`}
                                    onClick={() => onQuantityChange(line.id, line.quantity + 1)}
                                    className="inline-flex h-8 w-8 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                  </TooltipTrigger>
                                  <TooltipContent side="top">One more package</TooltipContent>
                                </Tooltip>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={cn("font-medium tabular-nums", !hasPrice && "text-destructive")}>
                                {item.current_unit_cost_cents !== null
                                  ? formatCurrency(item.current_unit_cost_cents)
                                  : "Price needed"}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-medium tabular-nums">
                              {item.current_unit_cost_cents !== null
                                ? formatCurrency(item.current_unit_cost_cents * line.quantity)
                                : "-"}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex justify-end gap-1">
                                <Tooltip>
                                  <TooltipTrigger
                                    type="button"
                                    aria-label={`Edit ${item.name}`}
                                    onClick={() => onEditItem(item)}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </TooltipTrigger>
                                  <TooltipContent side="top">Edit item</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger
                                    type="button"
                                    aria-label={`Remove ${item.name} from order draft`}
                                    onClick={() => onRemove(line.id)}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </TooltipTrigger>
                                  <TooltipContent side="top">Remove from order</TooltipContent>
                                </Tooltip>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}

function PurchaseLogTab({
  purchases,
  catalog,
  onLogPurchase,
}: {
  purchases: SupplyPurchase[];
  catalog: SupplyCatalogItem[];
  onLogPurchase: () => void;
}) {
  const itemById = new Map(catalog.map((item) => [item.id, item]));
  const purchasesByMonth = new Map<string, SupplyPurchase[]>();

  for (const purchase of purchases) {
    const month = purchase.purchased_at.slice(0, 7);
    purchasesByMonth.set(month, [...(purchasesByMonth.get(month) ?? []), purchase]);
  }

  const monthlyGroups = [...purchasesByMonth.entries()].sort(([firstMonth], [secondMonth]) =>
    secondMonth.localeCompare(firstMonth),
  );

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">Purchase log</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Each logged order becomes a price-history point for the item.
          </p>
        </div>
        <Button size="sm" onClick={onLogPurchase}><Plus className="h-4 w-4" />Purchase</Button>
      </CardHeader>
      <CardContent>
        {!purchases.length ? (
          <div className="flex min-h-56 flex-col items-center justify-center text-center">
            <ReceiptText className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No purchases logged in this draft</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">Start with the next Net32 or Amazon order. The item price will update automatically.</p>
            <Button className="mt-4" onClick={onLogPurchase}><Plus className="h-4 w-4" />Log first purchase</Button>
          </div>
        ) : (
          <div className="divide-y">
            {monthlyGroups.map(([month, monthPurchases]) => {
              const monthlyTotals = monthPurchases.reduce(
                (totals, purchase) => {
                  totals[purchase.category] += purchase.quantity * purchase.unit_cost_cents;
                  return totals;
                },
                { routine: 0, office: 0, implant_graft: 0 } as Record<SupplyCategory, number>,
              );
              const operatingTotal = monthlyTotals.routine + monthlyTotals.office;
              const overallTotal = operatingTotal + monthlyTotals.implant_graft;

              return (
                <details key={month} open className="py-4 first:pt-0 last:pb-0">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                    <div className="flex items-center gap-2 font-semibold">
                      <CalendarDays className="h-4 w-4 text-muted-foreground" />
                      {formatBudgetMonth(month)}
                      <span className="text-xs font-normal text-muted-foreground">
                        {monthPurchases.length} order{monthPurchases.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>Operating {formatCurrency(operatingTotal)}</span>
                      <span>Case materials {formatCurrency(monthlyTotals.implant_graft)}</span>
                      <span className="font-semibold text-foreground">All orders {formatCurrency(overallTotal)}</span>
                    </div>
                  </summary>
                  <div className="mt-4 overflow-x-auto rounded-lg border">
                    <table className="w-full min-w-[740px] text-sm">
                      <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                        <tr><th className="px-4 py-3 font-medium">Date</th><th className="px-4 py-3 font-medium">Item</th><th className="px-4 py-3 font-medium">Vendor</th><th className="px-4 py-3 font-medium">Quantity</th><th className="px-4 py-3 font-medium">Total</th><th className="px-4 py-3 font-medium">Budget treatment</th></tr>
                      </thead>
                      <tbody className="divide-y">
                        {monthPurchases.map((purchase) => {
                          const item = itemById.get(purchase.catalog_item_id);
                          const treatment = SUPPLY_CATEGORY_META[purchase.category].short_label;
                          return <tr key={purchase.id}><td className="px-4 py-3 tabular-nums">{purchase.purchased_at}</td><td className="px-4 py-3 font-medium">{item?.name ?? "Removed catalog item"}</td><td className="px-4 py-3">{purchase.vendor}</td><td className="px-4 py-3 tabular-nums">{purchase.quantity}</td><td className="px-4 py-3 font-medium tabular-nums">{formatCurrency(purchase.quantity * purchase.unit_cost_cents)}</td><td className="px-4 py-3 text-xs text-muted-foreground">{purchase.case_reference ? `${treatment} · ${purchase.case_reference}` : treatment}</td></tr>;
                        })}
                      </tbody>
                    </table>
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CostImpactTab({
  impactRows,
  onLogPurchase,
}: {
  impactRows: Array<{ id: string; item: SupplyCatalogItem; procedureName: string; units: number; unitCostCents: number; costCents: number }>;
  onLogPurchase: (itemId: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Procedure cost impact</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          This preview shows the direct material cost calculated from the current catalog unit price. Linking will become live with the Procedure Costs workspace in the next build.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
              <tr><th className="px-4 py-3 font-medium">Procedure</th><th className="px-4 py-3 font-medium">Supply item</th><th className="px-4 py-3 font-medium">Units used</th><th className="px-4 py-3 font-medium">Current cost</th><th className="px-4 py-3 font-medium">Procedure impact</th><th className="px-4 py-3 font-medium"><span className="sr-only">Action</span></th></tr>
            </thead>
            <tbody className="divide-y">
              {impactRows.map((row) => <tr key={row.id}><td className="px-4 py-3 font-medium">{row.procedureName}</td><td className="px-4 py-3">{row.item.name}</td><td className="px-4 py-3 tabular-nums">{row.units} x {formatCurrency(row.unitCostCents)}</td><td className="px-4 py-3 tabular-nums">{formatCurrency(row.unitCostCents)} per {row.item.unit_label}</td><td className="px-4 py-3 font-semibold tabular-nums">{formatCurrency(row.costCents)}</td><td className="px-4 py-3 text-right"><Button variant="outline" size="sm" onClick={() => onLogPurchase(row.item.id)}>Update price</Button></td></tr>)}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function CatalogItemDialog({
  open,
  onOpenChange,
  item,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: SupplyCatalogItem | null;
  onSave: (item: SupplyCatalogItem) => void;
}) {
  const isEditing = Boolean(item);
  const [name, setName] = useState(item?.name ?? "");
  const [vendor, setVendor] = useState(item?.vendor ?? "");
  const [catalogGroup, setCatalogGroup] = useState<SupplyCatalogGroup>(item?.catalog_group ?? "general");
  const [productUrl, setProductUrl] = useState(item?.product_url ?? "");
  const [alternativeUrls, setAlternativeUrls] = useState(item?.alternative_urls.join("\n") ?? "");
  const [price, setPrice] = useState(
    item?.current_unit_cost_cents === null || !item ? "" : moneyInputValue(item.current_unit_cost_cents),
  );
  const [unitLabel, setUnitLabel] = useState(item?.unit_label ?? "each");
  const [reorderLevel, setReorderLevel] = useState(String(item?.reorder_level ?? 1));

  function submit() {
    const hasPackagePrice = Boolean(price.trim());
    const currentUnitCost = hasPackagePrice ? parseDollarAmountToCents(price) : null;
    if (!name.trim()) {
      toast.error("Give the item a name");
      return;
    }
    if (currentUnitCost !== null && (!Number.isFinite(currentUnitCost) || currentUnitCost < 0)) {
      toast.error("Enter a valid package price");
      return;
    }

    const priceChanged = item?.current_unit_cost_cents !== currentUnitCost;
    onSave({
      id: item?.id ?? createSupplyId("supply"),
      name: name.trim(),
      vendor: vendor.trim() || "Vendor not set",
      category: item?.category === "implant_graft" ? "implant_graft" : catalogGroup === "office_cleaning" ? "office" : "routine",
      catalog_group: catalogGroup,
      product_url: productUrl.trim() || null,
      alternative_urls: alternativeUrls.split("\n").map((url) => url.trim()).filter(Boolean),
      unit_label: unitLabel.trim() || "each",
      current_unit_cost_cents: currentUnitCost,
      last_price_note: currentUnitCost === null ? item?.last_price_note ?? "Price needed" : null,
      prior_unit_cost_cents: item && priceChanged ? item.current_unit_cost_cents : item?.prior_unit_cost_cents ?? null,
      reorder_level: Math.max(0, Number(reorderLevel) || 0),
      quantity_on_hand: item?.quantity_on_hand ?? null,
      procedure_links: item?.procedure_links ?? [],
      updated_at: todayString(),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit catalog item" : "New catalog item"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div>
            <Label className="mb-1.5">Item name</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Articaine cartridges" autoFocus />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5">Preferred vendor</Label>
              <Input value={vendor} onChange={(event) => setVendor(event.target.value)} placeholder="Net32" />
            </div>
            <div>
              <Label className="mb-1.5">Category</Label>
              <CatalogGroupSelect value={catalogGroup} onChange={setCatalogGroup} />
            </div>
          </div>
          <div>
            <Label className="mb-1.5">Product link</Label>
            <Input value={productUrl} onChange={(event) => setProductUrl(event.target.value)} inputMode="url" placeholder="https://..." />
          </div>
          <div>
            <Label className="mb-1.5">Alternative links <span className="text-muted-foreground">(one per line)</span></Label>
            <Textarea value={alternativeUrls} onChange={(event) => setAlternativeUrls(event.target.value)} placeholder="https://..." className="min-h-20" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label className="mb-1.5">Current package price</Label>
              <Input value={price} onChange={(event) => setPrice(event.target.value)} inputMode="decimal" placeholder="0.00" />
            </div>
            <div>
              <Label className="mb-1.5">Unit</Label>
              <Input value={unitLabel} onChange={(event) => setUnitLabel(event.target.value)} placeholder="each" />
            </div>
            <div>
              <Label className="mb-1.5">Reorder level</Label>
              <Input value={reorderLevel} onChange={(event) => setReorderLevel(event.target.value)} inputMode="numeric" />
            </div>
          </div>
        </div>
        <DialogFooter showCloseButton>
          <Button onClick={submit}>{isEditing ? "Save changes" : "Add catalog item"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PurchaseDialog({ open, onOpenChange, catalog, selectedCatalogItemId, onSave }: { open: boolean; onOpenChange: (open: boolean) => void; catalog: SupplyCatalogItem[]; selectedCatalogItemId: string; onSave: (purchase: SupplyPurchase) => void }) {
  const initialItem = catalog.find((item) => item.id === selectedCatalogItemId) ?? catalog[0];
  const [catalogItemId, setCatalogItemId] = useState(initialItem?.id ?? "");
  const [budgetTreatment, setBudgetTreatment] = useState<SupplyCategory>(defaultBudgetTreatment(initialItem));
  const [vendor, setVendor] = useState(initialItem?.vendor ?? "");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState(
    initialItem?.current_unit_cost_cents !== null && initialItem ? moneyInputValue(initialItem.current_unit_cost_cents) : "",
  );
  const [purchasedAt, setPurchasedAt] = useState(todayString());
  const [caseReference, setCaseReference] = useState("");
  const [notes, setNotes] = useState("");
  const selectedItem = catalog.find((item) => item.id === catalogItemId) ?? catalog[0];

  function selectCatalogItem(nextItemId: string | null) {
    const nextItem = catalog.find((item) => item.id === nextItemId) ?? catalog[0];
    if (!nextItem) return;
    setCatalogItemId(nextItem.id);
    setBudgetTreatment(defaultBudgetTreatment(nextItem));
    setVendor(nextItem.vendor);
    setUnitPrice(nextItem.current_unit_cost_cents === null ? "" : moneyInputValue(nextItem.current_unit_cost_cents));
  }

  function submit() {
    if (!selectedItem) { toast.error("Add a catalog item first"); return; }
    const unitCostCents = parseDollarAmountToCents(unitPrice);
    const parsedQuantity = Number(quantity);
    if (!Number.isFinite(unitCostCents) || unitCostCents < 0) { toast.error("Enter a valid package price"); return; }
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) { toast.error("Enter a valid quantity"); return; }
    if (budgetTreatment === "implant_graft" && !caseReference.trim()) { toast.error("Add a non-identifying case reference for implant or graft material"); return; }
    onSave({ id: createSupplyId("purchase"), catalog_item_id: selectedItem.id, vendor: vendor.trim() || selectedItem.vendor, purchased_at: purchasedAt, quantity: parsedQuantity, unit_cost_cents: unitCostCents, category: budgetTreatment, case_reference: caseReference.trim() || null, notes: notes.trim() || null });
    setQuantity("1"); setCaseReference(""); setNotes("");
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Log purchase</DialogTitle></DialogHeader><div className="grid gap-4"><div><Label className="mb-1.5">Catalog item</Label><Select value={catalogItemId} onValueChange={selectCatalogItem}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{catalog.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div><div><Label className="mb-1.5">Budget treatment</Label><BudgetTreatmentSelect value={budgetTreatment} onChange={setBudgetTreatment} /></div><div className="rounded-lg border bg-muted/35 p-3 text-xs text-muted-foreground">{SUPPLY_CATEGORY_META[budgetTreatment].description}</div><div className="grid gap-3 sm:grid-cols-2"><div><Label className="mb-1.5">Vendor</Label><Input value={vendor} onChange={(event) => setVendor(event.target.value)} /></div><div><Label className="mb-1.5">Purchase date</Label><Input type="date" value={purchasedAt} onChange={(event) => setPurchasedAt(event.target.value)} /></div></div><div className="grid gap-3 sm:grid-cols-2"><div><Label className="mb-1.5">Packages</Label><Input value={quantity} onChange={(event) => setQuantity(event.target.value)} inputMode="decimal" /></div><div><Label className="mb-1.5">Price per package</Label><Input value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} inputMode="decimal" /></div></div>{budgetTreatment === "implant_graft" && <div><Label className="mb-1.5">Non-identifying case reference</Label><Input value={caseReference} onChange={(event) => setCaseReference(event.target.value)} placeholder="e.g. Implant plan 07-14-A" /></div>}<div><Label className="mb-1.5">Notes <span className="text-muted-foreground">(optional)</span></Label><Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Price check, approved substitution, shipping, etc." /></div></div><DialogFooter showCloseButton><Button onClick={submit}>Log purchase</Button></DialogFooter></DialogContent></Dialog>;
}

function BudgetLane({ label, targetPercent, budgetCents, baselineCents, loggedCents, color }: { label: string; targetPercent: number; budgetCents: number; baselineCents: number; loggedCents: number; color: "sky" | "amber" }) {
  const ratio = budgetCents > 0 ? Math.min(loggedCents / budgetCents, 1) : 0;
  return <div><div className="flex items-center justify-between gap-3"><div><p className="font-medium">{label}</p><p className="mt-0.5 text-xs text-muted-foreground">{targetPercent}% target · baseline {formatCurrency(baselineCents)}</p></div><span className="font-semibold tabular-nums">{formatCurrency(loggedCents)} / {formatCurrency(budgetCents)}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full transition-all", color === "sky" ? "bg-sky-500" : "bg-amber-500")} style={{ width: `${ratio * 100}%` }} /></div></div>;
}

function MetricCard({ icon, label, value, detail, tone = "default" }: { icon: ReactNode; label: string; value: string; detail: string; tone?: "default" | "danger" | "accent" }) {
  return <Card className={cn(tone === "danger" && "border-destructive/40", tone === "accent" && "border-emerald-200")}><CardContent className="p-5"><div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">{icon}{label}</div><p className={cn("mt-3 text-2xl font-semibold tabular-nums", tone === "danger" && "text-destructive", tone === "accent" && "text-emerald-700")}>{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></CardContent></Card>;
}

function ChecklistStep({ number, title, detail }: { number: string; title: string; detail: string }) { return <div className="flex gap-3 rounded-lg border p-4"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{number}</span><div><p className="font-medium">{title}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div></div>; }

function formatLastPrice(item: SupplyCatalogItem) { return item.current_unit_cost_cents === null ? item.last_price_note ?? "Price needed" : formatCurrency(item.current_unit_cost_cents); }

function PriceChange({ current, prior }: { current: number | null; prior: number | null }) { if (current === null) return <span className="text-xs text-muted-foreground">Needs review</span>; if (prior === null || prior === current) return <span className="text-xs text-muted-foreground">No prior price</span>; const difference = current - prior; const Icon = difference > 0 ? ArrowUpRight : ArrowDownRight; return <span className={cn("mt-0.5 flex items-center gap-0.5 text-xs", difference > 0 ? "text-destructive" : "text-emerald-700")}><Icon className="h-3 w-3" />{formatCurrency(Math.abs(difference))}</span>; }

function DollarField({ label, cents, onChange }: { label: string; cents: number; onChange: (cents: number) => void }) { return <div><Label className="mb-1.5">{label}</Label><Input key={String(cents)} defaultValue={moneyInputValue(cents)} inputMode="decimal" onBlur={(event) => { const next = parseDollarAmountToCents(event.target.value); if (Number.isFinite(next) && next >= 0) onChange(next); }} /></div>; }

function PercentField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <div><Label className="mb-1.5">{label}</Label><div className="relative"><Input value={String(value)} inputMode="decimal" onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next) && next >= 0 && next <= 100) onChange(next); }} className="pr-8" /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span></div></div>; }

function BudgetTreatmentSelect({ value, onChange }: { value: SupplyCategory; onChange: (value: SupplyCategory) => void }) { return <Select value={value} onValueChange={(next) => onChange((next ?? "routine") as SupplyCategory)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{(Object.keys(SUPPLY_CATEGORY_META) as SupplyCategory[]).map((category) => <SelectItem key={category} value={category}>{SUPPLY_CATEGORY_META[category].label}</SelectItem>)}</SelectContent></Select>; }

function CatalogGroupSelect({ value, onChange }: { value: SupplyCatalogGroup; onChange: (value: SupplyCatalogGroup) => void }) { return <Select value={value} onValueChange={(next) => onChange((next ?? "general") as SupplyCatalogGroup)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{(Object.keys(SUPPLY_CATALOG_GROUP_META) as SupplyCatalogGroup[]).map((group) => <SelectItem key={group} value={group}>{SUPPLY_CATALOG_GROUP_META[group].label}</SelectItem>)}</SelectContent></Select>; }
