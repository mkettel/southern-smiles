"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { deleteSupplyPurchase, saveSupplyWorkspace } from "@/actions/supplies";
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
  MapPin,
  Pencil,
  Phone,
  Plus,
  ReceiptText,
  Scissors,
  Search,
  ShoppingCart,
  Smile,
  SprayCan,
  Store,
  Target,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  buildSupplyBudgetSettingsByMonth,
  buildSupplyVendorDirectory,
  createSupplyBudgetSettingsForMonth,
  createSupplyId,
  createSupplyVendor,
  DEFAULT_SUPPLY_BUDGET_SETTINGS,
  DEFAULT_SUPPLY_CATALOG,
  DEFAULT_SUPPLY_VENDORS,
  getSupplyPurchasesForMonth,
  normalizeSupplyVendors,
  SUPPLY_CATALOG_GROUP_META,
  SUPPLY_CATEGORY_META,
  SUPPLY_ORDER_METHOD_META,
  supplyVendorKey,
  type SupplyBudgetSettings,
  type SupplyCatalogItem,
  type SupplyCatalogGroup,
  type SupplyCategory,
  type SupplyOrderDraftLine,
  type SupplyOrderMethod,
  type SupplyPurchase,
  type SupplyVendor,
  type SavedSupplyWorkspace,
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

interface SupplyOrderingWorkspaceProps {
  canManageBudget?: boolean;
  canDeletePurchases?: boolean;
  initialWorkspace?: SavedSupplyWorkspace | null;
  sharedPersistenceEnabled?: boolean;
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
    vendor_id: item.vendor_id ?? null,
    order_method: item.order_method ?? "online",
    ordering_instructions: item.ordering_instructions ?? null,
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
  return item?.category ?? "routine";
}

export function SupplyOrderingWorkspace({
  canManageBudget = true,
  canDeletePurchases = canManageBudget,
  initialWorkspace = null,
  sharedPersistenceEnabled = false,
}: SupplyOrderingWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
  const [catalog, setCatalog] = useState<SupplyCatalogItem[]>(DEFAULT_SUPPLY_CATALOG);
  const [purchases, setPurchases] = useState<SupplyPurchase[]>([]);
  const [orderDraft, setOrderDraft] = useState<SupplyOrderDraftLine[]>([]);
  const [vendors, setVendors] = useState<SupplyVendor[]>(DEFAULT_SUPPLY_VENDORS);
  const [settings, setSettings] = useState<SupplyBudgetSettings>(
    DEFAULT_SUPPLY_BUDGET_SETTINGS,
  );
  const [budgetSettingsByMonth, setBudgetSettingsByMonth] = useState<
    Record<string, SupplyBudgetSettings>
  >(() => buildSupplyBudgetSettingsByMonth({ settings: DEFAULT_SUPPLY_BUDGET_SETTINGS }));
  const [hasHydrated, setHasHydrated] = useState(false);
  const [catalogDialogOpen, setCatalogDialogOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [catalogItemToEdit, setCatalogItemToEdit] = useState<SupplyCatalogItem | null>(null);
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);
  const [purchaseToDelete, setPurchaseToDelete] = useState<SupplyPurchase | null>(null);
  const [purchaseDeletePending, setPurchaseDeletePending] = useState(false);
  const [selectedCatalogItemId, setSelectedCatalogItemId] = useState(
    DEFAULT_SUPPLY_CATALOG[0]?.id ?? "",
  );
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogGroupFilter, setCatalogGroupFilter] = useState<SupplyCatalogGroup | "all">("all");
  const lastSavedWorkspace = useRef<string | null>(null);
  const saveErrorShown = useRef(false);

  useEffect(() => {
    try {
      const localSaved = window.localStorage.getItem(STORAGE_KEY);
      const localParsed = localSaved ? JSON.parse(localSaved) as unknown : null;
      const restored = initialWorkspace ?? (isSupplyWorkspace(localParsed) ? localParsed : null);
      if (restored) {
        const restoredCatalog = isLegacyDemoCatalog(restored.catalog)
          ? DEFAULT_SUPPLY_CATALOG
          : restored.catalog.map(normalizeCatalogItem);
        setCatalog(restoredCatalog);
        setPurchases(restored.purchases);
        const restoredVendors = restored.vendors?.length
          ? normalizeSupplyVendors(restored.vendors)
          : buildSupplyVendorDirectory(restoredCatalog, restored.purchases);
        setVendors(restoredVendors);
        setOrderDraft((restored.orderDraft ?? []).map((line) => ({
          ...line,
          vendor_id: line.vendor_id ?? restoredVendors.find(
            (vendor) => vendor.name.toLocaleLowerCase() === line.vendor.toLocaleLowerCase(),
          )?.id ?? null,
          order_method: line.order_method ?? "online",
        })));
        const restoredSettings = normalizeSettings(restored.settings);
        const restoredBudgetSettings = Object.fromEntries(
          Object.entries(buildSupplyBudgetSettingsByMonth(restored)).map(([month, monthSettings]) => [
            month,
            normalizeSettings({ ...monthSettings, budget_month: month }),
          ]),
        );
        setSettings(restoredSettings);
        setBudgetSettingsByMonth(restoredBudgetSettings);
        setSelectedCatalogItemId(restoredCatalog[0]?.id ?? "");
        if (initialWorkspace) {
          lastSavedWorkspace.current = JSON.stringify({
            catalog: restoredCatalog,
            purchases: restored.purchases,
            settings: restoredSettings,
            budget_settings_by_month: restoredBudgetSettings,
            orderDraft: restored.orderDraft ?? [],
            vendors: restoredVendors,
          } satisfies SavedSupplyWorkspace);
        }
      }
    } catch {
      // A damaged local draft should never keep the workspace from opening.
    } finally {
      setHasHydrated(true);
    }
  }, [initialWorkspace]);

  useEffect(() => {
    if (!hasHydrated) return;
    const workspace = {
      catalog,
      purchases,
      settings,
      budget_settings_by_month: budgetSettingsByMonth,
      orderDraft,
      vendors,
    } satisfies SavedSupplyWorkspace;
    const serialized = JSON.stringify(workspace);
    window.localStorage.setItem(STORAGE_KEY, serialized);
    if (!sharedPersistenceEnabled) return;
    if (serialized === lastSavedWorkspace.current) return;

    const timeout = window.setTimeout(async () => {
      const result = await saveSupplyWorkspace(workspace);
      if (result.error) {
        if (!saveErrorShown.current) {
          toast.error("Supply changes could not be saved", { description: result.error });
          saveErrorShown.current = true;
        }
        return;
      }

      lastSavedWorkspace.current = serialized;
      saveErrorShown.current = false;
    }, 750);

    return () => window.clearTimeout(timeout);
  }, [budgetSettingsByMonth, catalog, hasHydrated, orderDraft, purchases, settings, sharedPersistenceEnabled, vendors]);

  function updateBudgetSettings(nextSettings: SupplyBudgetSettings) {
    if (nextSettings.budget_month !== settings.budget_month) {
      const selectedMonth = nextSettings.budget_month;
      const selectedSettings = budgetSettingsByMonth[selectedMonth]
        ?? createSupplyBudgetSettingsForMonth(selectedMonth, settings);
      setBudgetSettingsByMonth((current) => ({
        ...current,
        [settings.budget_month]: settings,
        [selectedMonth]: selectedSettings,
      }));
      setSettings(selectedSettings);
      return;
    }

    setSettings(nextSettings);
    setBudgetSettingsByMonth((current) => ({
      ...current,
      [nextSettings.budget_month]: nextSettings,
    }));
  }

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

  const budgetMonthPurchases = useMemo(
    () => getSupplyPurchasesForMonth(purchases, settings.budget_month),
    [purchases, settings.budget_month],
  );

  const purchaseTotals = useMemo(() => {
    return budgetMonthPurchases.reduce(
      (totals, purchase) => {
        const amountCents = purchase.quantity * purchase.unit_cost_cents;
        totals[purchase.category] += amountCents;
        return totals;
      },
      { routine: 0, office: 0, implant_graft: 0 } as Record<SupplyCategory, number>,
    );
  }, [budgetMonthPurchases]);

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

  const priceChangeRows = useMemo(() => {
    return catalog
      .filter(
        (item) =>
          item.current_unit_cost_cents !== null &&
          item.prior_unit_cost_cents !== null &&
          item.current_unit_cost_cents !== item.prior_unit_cost_cents,
      )
      .sort((first, second) =>
        second.updated_at.localeCompare(first.updated_at) || first.name.localeCompare(second.name),
      );
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

  function createVendor(
    name: string,
    method: SupplyOrderMethod,
    details?: { phone?: string; address?: string },
  ) {
    const key = supplyVendorKey(name);
    const existing = vendors.find((vendor) => supplyVendorKey(vendor.name) === key);
    if (existing) return existing;
    const vendor = {
      ...createSupplyVendor(name, method),
      phone: details?.phone?.trim() || null,
      address: details?.address?.trim() || null,
    };
    setVendors((current) => [...current, vendor].sort((first, second) => first.name.localeCompare(second.name)));
    return vendor;
  }

  function addToOrderDraft(itemId: string) {
    const item = catalog.find((catalogItem) => catalogItem.id === itemId);
    if (!item) return;
    const selectedVendor = vendors.find((vendor) => vendor.id === item.vendor_id)
      ?? vendors.find((vendor) => supplyVendorKey(vendor.name) === supplyVendorKey(item.vendor));
    if (!selectedVendor) {
      toast.error("Choose a vendor before adding this item to an order");
      openCatalogItemDialog(item);
      return;
    }
    const orderMethod = item.order_method ?? selectedVendor.default_order_method;

    setOrderDraft((current) => {
      const existing = current.find(
        (line) => line.catalog_item_id === item.id && line.vendor_id === selectedVendor.id,
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
          vendor: selectedVendor.name,
          vendor_id: selectedVendor.id,
          order_method: orderMethod,
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

  function openVendorProductPages(vendor: string, orderMethod: SupplyOrderMethod) {
    const links = orderDraft
      .filter((line) => line.vendor === vendor && (line.order_method ?? "online") === orderMethod)
      .map((line) => catalog.find((item) => item.id === line.catalog_item_id)?.product_url)
      .filter((url): url is string => Boolean(url));

    if (!links.length) {
      toast.error("Add a product link before opening this vendor order");
      return;
    }

    links.forEach((url) => window.open(url, "_blank", "noopener,noreferrer"));
    toast.success(`${links.length} product page${links.length === 1 ? "" : "s"} opened for ${vendor}`);
  }

  function markVendorOrderPlaced(vendor: string, orderMethod: SupplyOrderMethod) {
    const lines = orderDraft.filter(
      (line) => line.vendor === vendor && (line.order_method ?? "online") === orderMethod,
    );
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
        vendor_id: line.vendor_id ?? null,
        item_name: item.name,
        order_method: orderMethod,
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
    setOrderDraft((current) => current.filter(
      (line) => line.vendor !== vendor || (line.order_method ?? "online") !== orderMethod,
    ));
    toast.success(`${SUPPLY_ORDER_METHOD_META[orderMethod].past_tense} with ${vendor}`);
  }

  function clearOrderDraft() {
    setOrderDraft([]);
    setResetDialogOpen(false);
    toast.success("Order draft cleared");
  }

  async function removeCompletedPurchase() {
    if (!purchaseToDelete || purchaseDeletePending) return;
    setPurchaseDeletePending(true);
    const result = await deleteSupplyPurchase(purchaseToDelete.id);
    setPurchaseDeletePending(false);

    if (result.error) {
      toast.error("Purchase could not be removed", { description: result.error });
      return;
    }

    setPurchases((current) =>
      current.filter((purchase) => purchase.id !== purchaseToDelete.id),
    );
    toast.success(`${purchaseToDelete.item_name ?? "Purchase"} removed from the log`);
    setPurchaseToDelete(null);
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
          {canManageBudget && <TabsTrigger value="cost-impact">Procedure impact</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview" className="pt-6">
          <OverviewTab
            budget={budget}
            purchaseTotals={purchaseTotals}
            settings={settings}
            onSettingsChange={updateBudgetSettings}
            canManageBudget={canManageBudget}
            onLogPurchase={() => openPurchaseDialog()}
            budgetMonthPurchaseCount={budgetMonthPurchases.length}
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
            vendors={vendors}
            onQuantityChange={updateOrderDraftQuantity}
            onRemove={removeFromOrderDraft}
            onOpenVendorProductPages={openVendorProductPages}
            onMarkVendorOrderPlaced={markVendorOrderPlaced}
            onBrowseCatalog={() => setActiveTab("catalog")}
            onResetDraft={() => setResetDialogOpen(true)}
            onEditItem={openCatalogItemDialog}
          />
        </TabsContent>

        <TabsContent value="purchases" className="pt-6">
          <PurchaseLogTab
            purchases={recentPurchases}
            catalog={catalog}
            onLogPurchase={() => openPurchaseDialog()}
            canDeletePurchases={canDeletePurchases}
            onDeletePurchase={setPurchaseToDelete}
          />
        </TabsContent>

        {canManageBudget && (
          <TabsContent value="cost-impact" className="pt-6">
            <CostImpactTab
              impactRows={impactRows}
              priceChangeRows={priceChangeRows}
              onLogPurchase={openPurchaseDialog}
            />
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear this order draft?</DialogTitle>
            <DialogDescription>
              This removes all {orderDraft.length} item{orderDraft.length === 1 ? "" : "s"} currently
              waiting to be ordered. Your catalog, purchase history, and budget settings will not
              be changed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetDialogOpen(false)}>
              Keep draft
            </Button>
            <Button variant="destructive" onClick={clearOrderDraft}>
              <Trash2 className="h-4 w-4" />
              Clear order draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(purchaseToDelete)}
        onOpenChange={(open) => {
          if (!open && !purchaseDeletePending) setPurchaseToDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this completed purchase?</DialogTitle>
            <DialogDescription>
              This permanently removes {purchaseToDelete?.item_name ?? "this purchase"} from the
              purchase log. Monthly totals and automated supply-budget stats will be recalculated.
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={purchaseDeletePending}
              onClick={() => setPurchaseToDelete(null)}
            >
              Keep purchase
            </Button>
            <Button
              variant="destructive"
              disabled={purchaseDeletePending}
              onClick={removeCompletedPurchase}
            >
              <Trash2 className="h-4 w-4" />
              {purchaseDeletePending ? "Removing..." : "Remove purchase"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CatalogItemDialog
        key={catalogItemToEdit?.id ?? "new-item"}
        open={catalogDialogOpen}
        item={catalogItemToEdit}
        vendors={vendors}
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
        onCreateVendor={createVendor}
      />

      <PurchaseDialog
        key={`purchase-${purchaseDialogOpen}-${selectedCatalogItemId}`}
        open={purchaseDialogOpen}
        onOpenChange={setPurchaseDialogOpen}
        catalog={catalog}
        vendors={vendors}
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
                vendor_id: purchase.vendor_id ?? item.vendor_id ?? null,
                order_method: purchase.order_method ?? item.order_method ?? "online",
                prior_unit_cost_cents: priceChanged ? item.current_unit_cost_cents : item.prior_unit_cost_cents,
                current_unit_cost_cents: purchase.unit_cost_cents,
                updated_at: purchase.purchased_at,
              };
            }),
          );
          setPurchaseDialogOpen(false);
          toast.success("Purchase logged and catalog price updated");
        }}
        onCreateVendor={createVendor}
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
  budgetMonthPurchaseCount,
}: {
  budget: { routineCents: number; officeCents: number; combinedCents: number };
  purchaseTotals: Record<SupplyCategory, number>;
  settings: SupplyBudgetSettings;
  onSettingsChange: (settings: SupplyBudgetSettings) => void;
  canManageBudget: boolean;
  onLogPurchase: () => void;
  budgetMonthPurchaseCount: number;
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
            budgetMonthPurchaseCount
              ? `${budgetMonthPurchaseCount} purchase${budgetMonthPurchaseCount === 1 ? "" : "s"} in ${budgetMonth}`
              : `No purchases logged in ${budgetMonth}`
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

        {canManageBudget && (
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="text-base">Monthly budget</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Set and publish the supply budget during the first week of the month.
                </p>
              </div>
              <Badge variant="outline" className="gap-1.5">
                <LockKeyhole className="h-3 w-3" />
                Admin only
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
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
              <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                {settings.published_at
                  ? `Published ${settings.published_at} by ${settings.published_by ?? "an admin"}.`
                  : "Changes are waiting to be published to the supply officer."} Current baseline: {formatCurrency(settings.routine_baseline_cents)} routine and {formatCurrency(settings.office_baseline_cents)} office. The intended long-term targets are 4% and 1.25% after the transition period.
              </div>
            </CardContent>
          </Card>
        )}
      </div>

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
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span>{item.vendor === "Vendor not set" ? "Vendor not assigned" : item.vendor}</span>
                      <span>·</span>
                      <span>{SUPPLY_ORDER_METHOD_META[item.order_method ?? "online"].label}</span>
                    </div>
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
  vendors,
  onQuantityChange,
  onRemove,
  onOpenVendorProductPages,
  onMarkVendorOrderPlaced,
  onBrowseCatalog,
  onResetDraft,
  onEditItem,
}: {
  orderDraft: SupplyOrderDraftLine[];
  catalog: SupplyCatalogItem[];
  vendors: SupplyVendor[];
  onQuantityChange: (lineId: string, quantity: number) => void;
  onRemove: (lineId: string) => void;
  onOpenVendorProductPages: (vendor: string, orderMethod: SupplyOrderMethod) => void;
  onMarkVendorOrderPlaced: (vendor: string, orderMethod: SupplyOrderMethod) => void;
  onBrowseCatalog: () => void;
  onResetDraft: () => void;
  onEditItem: (item: SupplyCatalogItem) => void;
}) {
  const itemById = new Map(catalog.map((item) => [item.id, item]));
  const vendorOrders = new Map<string, Array<{ line: SupplyOrderDraftLine; item: SupplyCatalogItem }>>();

  for (const line of orderDraft) {
    const item = itemById.get(line.catalog_item_id);
    if (!item) continue;
    const groupKey = `${line.vendor_id ?? line.vendor}::${line.order_method ?? "online"}`;
    vendorOrders.set(groupKey, [...(vendorOrders.get(groupKey) ?? []), { line, item }]);
  }

  const groupedOrders = [...vendorOrders.entries()].sort(([firstKey], [secondKey]) =>
    firstKey.localeCompare(secondKey),
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
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onBrowseCatalog}>
            <Plus className="h-4 w-4" />
            Add supplies
          </Button>
          {orderDraft.length > 0 && (
            <Button variant="destructive" size="sm" onClick={onResetDraft}>
              <Trash2 className="h-4 w-4" />
              Reset draft
            </Button>
          )}
        </div>
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
        groupedOrders.map(([groupKey, lines]) => {
          const firstLine = lines[0].line;
          const vendor = firstLine.vendor;
          const orderMethod = firstLine.order_method ?? "online";
          const vendorRecord = vendors.find((entry) => entry.id === firstLine.vendor_id)
            ?? vendors.find((entry) => supplyVendorKey(entry.name) === supplyVendorKey(vendor));
          const methodMeta = SUPPLY_ORDER_METHOD_META[orderMethod];
          const productLinkCount = lines.filter(({ item }) => Boolean(item.product_url)).length;
          const missingPriceCount = lines.filter(
            ({ item }) => item.current_unit_cost_cents === null,
          ).length;
          const estimatedTotal = lines.reduce(
            (total, { line, item }) => total + (item.current_unit_cost_cents ?? 0) * line.quantity,
            0,
          );

          return (
            <Card key={groupKey}>
              <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-base">{vendor}</CardTitle>
                    <Badge variant="outline" className="gap-1.5">
                      {orderMethod === "online" && <ExternalLink className="h-3 w-3" />}
                      {orderMethod === "phone" && <Phone className="h-3 w-3" />}
                      {orderMethod === "in_person" && <Store className="h-3 w-3" />}
                      {methodMeta.label}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {lines.length} item{lines.length === 1 ? "" : "s"} · expected total {formatCurrency(estimatedTotal)}
                    {missingPriceCount ? ` · ${missingPriceCount} price${missingPriceCount === 1 ? "" : "s"} needed` : ""}
                  </p>
                  {(lines[0].item.ordering_instructions || vendorRecord?.ordering_instructions) && (
                    <p className="mt-2 max-w-2xl text-xs text-muted-foreground">
                      {lines[0].item.ordering_instructions || vendorRecord?.ordering_instructions}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {orderMethod === "online" && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!productLinkCount}
                      onClick={() => onOpenVendorProductPages(vendor, orderMethod)}
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open {productLinkCount} item page{productLinkCount === 1 ? "" : "s"}
                    </Button>
                  )}
                  {orderMethod === "phone" && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!vendorRecord?.phone}
                      onClick={() => {
                        if (vendorRecord?.phone) window.location.href = `tel:${vendorRecord.phone}`;
                      }}
                    >
                      <Phone className="h-4 w-4" />
                      {vendorRecord?.phone ? "Call vendor" : "Phone not added"}
                    </Button>
                  )}
                  {orderMethod === "in_person" && vendorRecord?.address && (
                    <div className="flex items-center gap-1.5 px-2 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      {vendorRecord.address}
                    </div>
                  )}
                  <Button
                    size="sm"
                    disabled={Boolean(missingPriceCount)}
                    onClick={() => onMarkVendorOrderPlaced(vendor, orderMethod)}
                  >
                    <ReceiptText className="h-4 w-4" />
                    {orderMethod === "in_person" ? "Mark purchased" : "Mark ordered"}
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
  canDeletePurchases,
  onDeletePurchase,
}: {
  purchases: SupplyPurchase[];
  catalog: SupplyCatalogItem[];
  onLogPurchase: () => void;
  canDeletePurchases: boolean;
  onDeletePurchase: (purchase: SupplyPurchase) => void;
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
            Completed purchases are frozen snapshots. Purchasing officers and admins can remove
            mistaken entries.
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
                    <table className="w-full min-w-[800px] text-sm">
                      <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 font-medium">Date</th>
                          <th className="px-4 py-3 font-medium">Item</th>
                          <th className="px-4 py-3 font-medium">Vendor</th>
                          <th className="px-4 py-3 font-medium">Method</th>
                          <th className="px-4 py-3 font-medium">Quantity</th>
                          <th className="px-4 py-3 font-medium">Total</th>
                          <th className="px-4 py-3 font-medium">Budget treatment</th>
                          {canDeletePurchases && (
                            <th className="px-4 py-3 text-right font-medium">Actions</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {monthPurchases.map((purchase) => {
                          const item = itemById.get(purchase.catalog_item_id);
                          const treatment = SUPPLY_CATEGORY_META[purchase.category].short_label;
                          const method = purchase.order_method ?? "online";
                          const itemName = purchase.item_name ?? item?.name ?? "Removed catalog item";
                          return (
                            <tr key={purchase.id}>
                              <td className="px-4 py-3 tabular-nums">{purchase.purchased_at}</td>
                              <td className="px-4 py-3 font-medium">{itemName}</td>
                              <td className="px-4 py-3">{purchase.vendor}</td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">
                                {SUPPLY_ORDER_METHOD_META[method].label}
                              </td>
                              <td className="px-4 py-3 tabular-nums">{purchase.quantity}</td>
                              <td className="px-4 py-3 font-medium tabular-nums">
                                {formatCurrency(purchase.quantity * purchase.unit_cost_cents)}
                              </td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">
                                {purchase.case_reference ? `${treatment} · ${purchase.case_reference}` : treatment}
                              </td>
                              {canDeletePurchases && (
                                <td className="px-4 py-3 text-right">
                                  <Tooltip>
                                    <TooltipTrigger
                                      type="button"
                                      aria-label={`Remove ${itemName} from purchase log`}
                                      onClick={() => onDeletePurchase(purchase)}
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </TooltipTrigger>
                                    <TooltipContent side="top">Remove mistaken purchase</TooltipContent>
                                  </Tooltip>
                                </td>
                              )}
                            </tr>
                          );
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
  priceChangeRows,
  onLogPurchase,
}: {
  impactRows: Array<{ id: string; item: SupplyCatalogItem; procedureName: string; units: number; unitCostCents: number; costCents: number }>;
  priceChangeRows: SupplyCatalogItem[];
  onLogPurchase: (itemId: string) => void;
}) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent price changes</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Review catalog prices that changed when an item was edited or a purchase was logged.
          </p>
        </CardHeader>
        <CardContent>
          {priceChangeRows.length ? (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Supply item</th>
                    <th className="px-4 py-3 font-medium">Previous price</th>
                    <th className="px-4 py-3 font-medium">Current price</th>
                    <th className="px-4 py-3 font-medium">Change</th>
                    <th className="px-4 py-3 font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {priceChangeRows.map((item) => {
                    const currentPrice = item.current_unit_cost_cents ?? 0;
                    const previousPrice = item.prior_unit_cost_cents ?? 0;
                    const difference = currentPrice - previousPrice;
                    const percentChange = previousPrice > 0 ? (difference / previousPrice) * 100 : null;
                    const Icon = difference > 0 ? ArrowUpRight : ArrowDownRight;
                    return (
                      <tr key={item.id}>
                        <td className="px-4 py-3">
                          <div className="font-medium">{item.name}</div>
                          <div className="mt-0.5 text-xs text-muted-foreground">{item.vendor}</div>
                        </td>
                        <td className="px-4 py-3 tabular-nums">{formatCurrency(previousPrice)}</td>
                        <td className="px-4 py-3 font-medium tabular-nums">{formatCurrency(currentPrice)}</td>
                        <td className={cn("px-4 py-3 font-medium tabular-nums", difference > 0 ? "text-destructive" : "text-emerald-700")}>
                          <span className="inline-flex items-center gap-1">
                            <Icon className="h-4 w-4" />
                            {formatCurrency(Math.abs(difference))}
                            {percentChange !== null && ` (${Math.abs(percentChange).toFixed(1)}%)`}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{item.updated_at}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No price changes have been recorded yet.
            </div>
          )}
        </CardContent>
      </Card>

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
    </div>
  );
}

function CatalogItemDialog({
  open,
  onOpenChange,
  item,
  vendors,
  onSave,
  onCreateVendor,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: SupplyCatalogItem | null;
  vendors: SupplyVendor[];
  onSave: (item: SupplyCatalogItem) => void;
  onCreateVendor: (name: string, method: SupplyOrderMethod, details?: { phone?: string; address?: string }) => SupplyVendor;
}) {
  const isEditing = Boolean(item);
  const [name, setName] = useState(item?.name ?? "");
  const initialVendor = vendors.find((vendor) => vendor.id === item?.vendor_id)
    ?? vendors.find((vendor) => item && supplyVendorKey(vendor.name) === supplyVendorKey(item.vendor));
  const [vendorId, setVendorId] = useState(initialVendor?.id ?? "");
  const [orderMethod, setOrderMethod] = useState<SupplyOrderMethod>(
    item?.order_method ?? initialVendor?.default_order_method ?? "online",
  );
  const [orderingInstructions, setOrderingInstructions] = useState(item?.ordering_instructions ?? "");
  const [addingVendor, setAddingVendor] = useState(false);
  const [newVendorName, setNewVendorName] = useState("");
  const [newVendorMethod, setNewVendorMethod] = useState<SupplyOrderMethod>("online");
  const [newVendorContact, setNewVendorContact] = useState("");
  const [catalogGroup, setCatalogGroup] = useState<SupplyCatalogGroup>(item?.catalog_group ?? "general");
  const [budgetTreatment, setBudgetTreatment] = useState<SupplyCategory>(
    item?.category ?? "routine",
  );
  const [productUrl, setProductUrl] = useState(item?.product_url ?? "");
  const [alternativeUrls, setAlternativeUrls] = useState(item?.alternative_urls.join("\n") ?? "");
  const [price, setPrice] = useState(
    item?.current_unit_cost_cents === null || !item ? "" : moneyInputValue(item.current_unit_cost_cents),
  );
  const [unitLabel, setUnitLabel] = useState(item?.unit_label ?? "each");
  const [reorderLevel, setReorderLevel] = useState(String(item?.reorder_level ?? 1));

  function selectVendor(nextVendorId: string | null) {
    if (nextVendorId === "__add_vendor__") {
      setAddingVendor(true);
      return;
    }
    const vendor = vendors.find((entry) => entry.id === nextVendorId);
    if (!vendor) return;
    setVendorId(vendor.id);
    setOrderMethod(vendor.default_order_method);
    setAddingVendor(false);
  }

  function addVendor() {
    if (!newVendorName.trim()) {
      toast.error("Give the vendor a name");
      return;
    }
    const vendor = onCreateVendor(newVendorName.trim(), newVendorMethod, {
      phone: newVendorMethod === "phone" ? newVendorContact : undefined,
      address: newVendorMethod === "in_person" ? newVendorContact : undefined,
    });
    setVendorId(vendor.id);
    setOrderMethod(vendor.default_order_method);
    setNewVendorName("");
    setNewVendorContact("");
    setAddingVendor(false);
    toast.success(`${vendor.name} added to the vendor list`);
  }

  function submit() {
    const hasPackagePrice = Boolean(price.trim());
    const currentUnitCost = hasPackagePrice ? parseDollarAmountToCents(price) : null;
    if (!name.trim()) {
      toast.error("Give the item a name");
      return;
    }
    const selectedVendor = vendors.find((vendor) => vendor.id === vendorId);
    if (!selectedVendor) {
      toast.error("Choose a vendor from the list");
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
      vendor: selectedVendor.name,
      vendor_id: selectedVendor.id,
      order_method: orderMethod,
      ordering_instructions: orderingInstructions.trim() || null,
      category: budgetTreatment,
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
              <Select value={vendorId} onValueChange={selectVendor}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select vendor">{vendors.find((vendor) => vendor.id === vendorId)?.name}</SelectValue></SelectTrigger>
                <SelectContent>
                  {vendors.map((vendor) => <SelectItem key={vendor.id} value={vendor.id}>{vendor.name}</SelectItem>)}
                  <SelectItem value="__add_vendor__">+ Add new vendor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5">Catalog category</Label>
              <CatalogGroupSelect
                value={catalogGroup}
                onChange={(group) => {
                  setCatalogGroup(group);
                  if (budgetTreatment !== "implant_graft") {
                    setBudgetTreatment(group === "office_cleaning" ? "office" : "routine");
                  }
                }}
              />
            </div>
          </div>
          <div>
            <Label className="mb-1.5">Budget treatment</Label>
            <BudgetTreatmentSelect value={budgetTreatment} onChange={setBudgetTreatment} />
            <p className="mt-1.5 text-xs text-muted-foreground">
              {SUPPLY_CATEGORY_META[budgetTreatment].description}
            </p>
          </div>
          {addingVendor && (
            <div className="grid gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-2 sm:items-end">
              <div>
                <Label className="mb-1.5">New vendor name</Label>
                <Input value={newVendorName} onChange={(event) => setNewVendorName(event.target.value)} placeholder="e.g. Safeway" />
              </div>
              <div>
                <Label className="mb-1.5">Usual method</Label>
                <OrderMethodSelect value={newVendorMethod} onChange={setNewVendorMethod} />
              </div>
              {newVendorMethod !== "online" && (
                <div>
                  <Label className="mb-1.5">{newVendorMethod === "phone" ? "Phone number" : "Store / location"}</Label>
                  <Input value={newVendorContact} onChange={(event) => setNewVendorContact(event.target.value)} placeholder={newVendorMethod === "phone" ? "(602) 555-0100" : "Safeway next door"} />
                </div>
              )}
              <Button type="button" variant="outline" onClick={addVendor}>Add vendor</Button>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5">How this item is usually purchased</Label>
              <OrderMethodSelect value={orderMethod} onChange={setOrderMethod} />
            </div>
            <div>
              <Label className="mb-1.5">Ordering note <span className="text-muted-foreground">(optional)</span></Label>
              <Input value={orderingInstructions} onChange={(event) => setOrderingInstructions(event.target.value)} placeholder={orderMethod === "in_person" ? "Buy next door when low" : orderMethod === "phone" ? "Ask for the office account" : "Confirm free shipping"} />
            </div>
          </div>
          {orderMethod === "online" && (
            <>
              <div>
                <Label className="mb-1.5">Product link</Label>
                <Input value={productUrl} onChange={(event) => setProductUrl(event.target.value)} inputMode="url" placeholder="https://..." />
              </div>
              <div>
                <Label className="mb-1.5">Alternative links <span className="text-muted-foreground">(one per line)</span></Label>
                <Textarea value={alternativeUrls} onChange={(event) => setAlternativeUrls(event.target.value)} placeholder="https://..." className="min-h-20" />
              </div>
            </>
          )}
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

function PurchaseDialog({
  open,
  onOpenChange,
  catalog,
  vendors,
  selectedCatalogItemId,
  onSave,
  onCreateVendor,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: SupplyCatalogItem[];
  vendors: SupplyVendor[];
  selectedCatalogItemId: string;
  onSave: (purchase: SupplyPurchase) => void;
  onCreateVendor: (name: string, method: SupplyOrderMethod, details?: { phone?: string; address?: string }) => SupplyVendor;
}) {
  const initialItem = catalog.find((item) => item.id === selectedCatalogItemId) ?? catalog[0];
  const initialVendor = vendors.find((vendor) => vendor.id === initialItem?.vendor_id)
    ?? vendors.find((vendor) => initialItem && supplyVendorKey(vendor.name) === supplyVendorKey(initialItem.vendor));
  const [catalogItemId, setCatalogItemId] = useState(initialItem?.id ?? "");
  const [budgetTreatment, setBudgetTreatment] = useState<SupplyCategory>(defaultBudgetTreatment(initialItem));
  const [vendorId, setVendorId] = useState(initialVendor?.id ?? "");
  const [orderMethod, setOrderMethod] = useState<SupplyOrderMethod>(initialItem?.order_method ?? initialVendor?.default_order_method ?? "online");
  const [addingVendor, setAddingVendor] = useState(false);
  const [newVendorName, setNewVendorName] = useState("");
  const [newVendorContact, setNewVendorContact] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState(
    initialItem?.current_unit_cost_cents !== null && initialItem ? moneyInputValue(initialItem.current_unit_cost_cents) : "",
  );
  const [purchasedAt, setPurchasedAt] = useState(todayString());
  const [notes, setNotes] = useState("");
  const selectedItem = catalog.find((item) => item.id === catalogItemId) ?? catalog[0];

  function selectCatalogItem(nextItemId: string | null) {
    const nextItem = catalog.find((item) => item.id === nextItemId) ?? catalog[0];
    if (!nextItem) return;
    setCatalogItemId(nextItem.id);
    setBudgetTreatment(defaultBudgetTreatment(nextItem));
    const vendor = vendors.find((entry) => entry.id === nextItem.vendor_id)
      ?? vendors.find((entry) => supplyVendorKey(entry.name) === supplyVendorKey(nextItem.vendor));
    setVendorId(vendor?.id ?? "");
    setOrderMethod(nextItem.order_method ?? vendor?.default_order_method ?? "online");
    setUnitPrice(nextItem.current_unit_cost_cents === null ? "" : moneyInputValue(nextItem.current_unit_cost_cents));
  }

  function selectVendor(nextVendorId: string | null) {
    if (nextVendorId === "__add_vendor__") {
      setAddingVendor(true);
      return;
    }
    const vendor = vendors.find((entry) => entry.id === nextVendorId);
    if (!vendor) return;
    setVendorId(vendor.id);
    setOrderMethod(vendor.default_order_method);
    setAddingVendor(false);
  }

  function addVendor() {
    if (!newVendorName.trim()) {
      toast.error("Give the vendor a name");
      return;
    }
    const vendor = onCreateVendor(newVendorName.trim(), orderMethod, {
      phone: orderMethod === "phone" ? newVendorContact : undefined,
      address: orderMethod === "in_person" ? newVendorContact : undefined,
    });
    setVendorId(vendor.id);
    setNewVendorName("");
    setNewVendorContact("");
    setAddingVendor(false);
  }

  function submit() {
    if (!selectedItem) { toast.error("Add a catalog item first"); return; }
    const selectedVendor = vendors.find((vendor) => vendor.id === vendorId);
    if (!selectedVendor) { toast.error("Choose a vendor from the list"); return; }
    const unitCostCents = parseDollarAmountToCents(unitPrice);
    const parsedQuantity = Number(quantity);
    if (!Number.isFinite(unitCostCents) || unitCostCents < 0) { toast.error("Enter a valid package price"); return; }
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) { toast.error("Enter a valid quantity"); return; }
    onSave({
      id: createSupplyId("purchase"),
      catalog_item_id: selectedItem.id,
      item_name: selectedItem.name,
      vendor: selectedVendor.name,
      vendor_id: selectedVendor.id,
      order_method: orderMethod,
      purchased_at: purchasedAt,
      quantity: parsedQuantity,
      unit_cost_cents: unitCostCents,
      category: budgetTreatment,
      case_reference: null,
      notes: notes.trim() || null,
    });
    setQuantity("1"); setNotes("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Log purchase</DialogTitle>
          <DialogDescription>
            This creates a historical snapshot. Later catalog edits will not change it.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div>
            <Label className="mb-1.5">Catalog item</Label>
            <Select value={catalogItemId} onValueChange={selectCatalogItem}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{catalog.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5">Vendor</Label>
              <Select value={vendorId} onValueChange={selectVendor}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select vendor">{vendors.find((vendor) => vendor.id === vendorId)?.name}</SelectValue></SelectTrigger>
                <SelectContent>
                  {vendors.map((vendor) => <SelectItem key={vendor.id} value={vendor.id}>{vendor.name}</SelectItem>)}
                  <SelectItem value="__add_vendor__">+ Add new vendor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5">Purchase method</Label>
              <OrderMethodSelect value={orderMethod} onChange={setOrderMethod} />
            </div>
          </div>
          {addingVendor && (
            <div className="grid gap-2 rounded-md border bg-muted/30 p-3 sm:grid-cols-[1fr_1fr_auto]">
              <Input value={newVendorName} onChange={(event) => setNewVendorName(event.target.value)} placeholder="New vendor name" />
              {orderMethod === "online" ? <div /> : (
                <Input value={newVendorContact} onChange={(event) => setNewVendorContact(event.target.value)} placeholder={orderMethod === "phone" ? "Phone number" : "Store / location"} />
              )}
              <Button type="button" variant="outline" onClick={addVendor}>Add vendor</Button>
            </div>
          )}
          <div>
            <Label className="mb-1.5">Budget treatment</Label>
            <BudgetTreatmentSelect value={budgetTreatment} onChange={setBudgetTreatment} />
          </div>
          <div className="rounded-lg border bg-muted/35 p-3 text-xs text-muted-foreground">{SUPPLY_CATEGORY_META[budgetTreatment].description}</div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><Label className="mb-1.5">Purchase date</Label><Input type="date" value={purchasedAt} onChange={(event) => setPurchasedAt(event.target.value)} /></div>
            <div><Label className="mb-1.5">Packages</Label><Input value={quantity} onChange={(event) => setQuantity(event.target.value)} inputMode="decimal" /></div>
            <div><Label className="mb-1.5">Price per package</Label><Input value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} inputMode="decimal" /></div>
          </div>
          <div><Label className="mb-1.5">Notes <span className="text-muted-foreground">(optional)</span></Label><Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Price check, approved substitution, shipping, etc." /></div>
        </div>
        <DialogFooter showCloseButton><Button onClick={submit}>Log purchase</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BudgetLane({ label, targetPercent, budgetCents, baselineCents, loggedCents, color }: { label: string; targetPercent: number; budgetCents: number; baselineCents: number; loggedCents: number; color: "sky" | "amber" }) {
  const ratio = budgetCents > 0 ? Math.min(loggedCents / budgetCents, 1) : 0;
  return <div><div className="flex items-center justify-between gap-3"><div><p className="font-medium">{label}</p><p className="mt-0.5 text-xs text-muted-foreground">{targetPercent}% target · baseline {formatCurrency(baselineCents)}</p></div><span className="font-semibold tabular-nums">{formatCurrency(loggedCents)} / {formatCurrency(budgetCents)}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full transition-all", color === "sky" ? "bg-sky-500" : "bg-amber-500")} style={{ width: `${ratio * 100}%` }} /></div></div>;
}

function MetricCard({ icon, label, value, detail, tone = "default" }: { icon: ReactNode; label: string; value: string; detail: string; tone?: "default" | "danger" | "accent" }) {
  return <Card className={cn(tone === "danger" && "border-destructive/40", tone === "accent" && "border-emerald-200")}><CardContent className="p-5"><div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">{icon}{label}</div><p className={cn("mt-3 text-2xl font-semibold tabular-nums", tone === "danger" && "text-destructive", tone === "accent" && "text-emerald-700")}>{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></CardContent></Card>;
}


function formatLastPrice(item: SupplyCatalogItem) { return item.current_unit_cost_cents === null ? item.last_price_note ?? "Price needed" : formatCurrency(item.current_unit_cost_cents); }

function PriceChange({ current, prior }: { current: number | null; prior: number | null }) { if (current === null) return <span className="text-xs text-muted-foreground">Needs review</span>; if (prior === null || prior === current) return <span className="text-xs text-muted-foreground">No prior price</span>; const difference = current - prior; const Icon = difference > 0 ? ArrowUpRight : ArrowDownRight; return <span className={cn("mt-0.5 flex items-center gap-0.5 text-xs", difference > 0 ? "text-destructive" : "text-emerald-700")}><Icon className="h-3 w-3" />{formatCurrency(Math.abs(difference))}</span>; }

function DollarField({ label, cents, onChange }: { label: string; cents: number; onChange: (cents: number) => void }) { return <div><Label className="mb-1.5">{label}</Label><Input key={String(cents)} defaultValue={moneyInputValue(cents)} inputMode="decimal" onBlur={(event) => { const next = parseDollarAmountToCents(event.target.value); if (Number.isFinite(next) && next >= 0) onChange(next); }} /></div>; }

function PercentField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  function commitDraft() {
    const next = Number(draft.trim().replace(",", "."));
    if (!Number.isFinite(next) || next < 0 || next > 100) {
      setDraft(String(value));
      return;
    }

    setDraft(String(next));
    if (next !== value) onChange(next);
  }

  return (
    <div>
      <Label className="mb-1.5">{label}</Label>
      <div className="relative">
        <Input
          value={draft}
          inputMode="decimal"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          className="pr-8"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          %
        </span>
      </div>
    </div>
  );
}

function BudgetTreatmentSelect({ value, onChange }: { value: SupplyCategory; onChange: (value: SupplyCategory) => void }) { return <Select value={value} onValueChange={(next) => onChange((next ?? "routine") as SupplyCategory)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{(Object.keys(SUPPLY_CATEGORY_META) as SupplyCategory[]).map((category) => <SelectItem key={category} value={category}>{SUPPLY_CATEGORY_META[category].label}</SelectItem>)}</SelectContent></Select>; }

function CatalogGroupSelect({ value, onChange }: { value: SupplyCatalogGroup; onChange: (value: SupplyCatalogGroup) => void }) { return <Select value={value} onValueChange={(next) => onChange((next ?? "general") as SupplyCatalogGroup)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{(Object.keys(SUPPLY_CATALOG_GROUP_META) as SupplyCatalogGroup[]).map((group) => <SelectItem key={group} value={group}>{SUPPLY_CATALOG_GROUP_META[group].label}</SelectItem>)}</SelectContent></Select>; }

function OrderMethodSelect({ value, onChange }: { value: SupplyOrderMethod; onChange: (value: SupplyOrderMethod) => void }) {
  return (
    <Select value={value} onValueChange={(next) => onChange((next ?? "online") as SupplyOrderMethod)}>
      <SelectTrigger className="w-full"><SelectValue>{SUPPLY_ORDER_METHOD_META[value].label}</SelectValue></SelectTrigger>
      <SelectContent>
        {(Object.keys(SUPPLY_ORDER_METHOD_META) as SupplyOrderMethod[]).map((method) => (
          <SelectItem key={method} value={method}>{SUPPLY_ORDER_METHOD_META[method].label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
