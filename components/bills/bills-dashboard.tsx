"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  CalendarDays,
  Check,
  Folder,
  Pencil,
  Plus,
  ReceiptText,
  WalletCards,
} from "lucide-react";
import {
  createBill,
  createBillVendor,
  getBillsDashboardData,
  markBillPaid,
  updateBill,
  updateBillVendor,
} from "@/actions/bills";
import {
  BILL_AGING_BUCKETS,
  BILL_AGING_LABELS,
  BILL_CATEGORIES,
  buildBillsSummary,
  buildVendorSummaries,
  formatCurrency,
  formatDateLabel,
  getAgingBucket,
  parseDollarAmountToCents,
  todayString,
} from "@/lib/bills";
import { cn } from "@/lib/utils";
import type {
  Bill,
  BillAgingBucket,
  BillCategory,
  BillsDashboardData,
  BillStatus,
  BillVendorSummary,
} from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type BillSort = "due_asc" | "due_desc" | "amount_asc" | "amount_desc";

interface BillsDashboardProps {
  initialData: BillsDashboardData;
}

interface Filters {
  vendorId: string;
  category: string;
  aging: string;
  status: string;
  dueFrom: string;
  dueTo: string;
  amountMin: string;
  amountMax: string;
  paidMonth: string;
  sort: BillSort;
}

const DEFAULT_FILTERS: Filters = {
  vendorId: "all",
  category: "all",
  aging: "all",
  status: "all",
  dueFrom: "",
  dueTo: "",
  amountMin: "",
  amountMax: "",
  paidMonth: "",
  sort: "due_asc",
};

export function BillsDashboard({ initialData }: BillsDashboardProps) {
  const [data, setData] = useState(initialData);
  const [selectedVendorId, setSelectedVendorId] = useState("all");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [billDialogOpen, setBillDialogOpen] = useState(false);
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<BillVendorSummary | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  const billsForSummary =
    selectedVendorId === "all"
      ? data.bills
      : data.bills.filter((bill) => bill.vendor_id === selectedVendorId);

  const summary = buildBillsSummary(billsForSummary);
  const vendors = buildVendorSummaries(data.vendors, data.bills);

  const filteredBills = useMemo(() => {
    const minCents = filters.amountMin
      ? parseDollarAmountToCents(filters.amountMin)
      : null;
    const maxCents = filters.amountMax
      ? parseDollarAmountToCents(filters.amountMax)
      : null;

    return data.bills
      .filter((bill) => {
        if (selectedVendorId !== "all" && bill.vendor_id !== selectedVendorId) {
          return false;
        }
        if (filters.vendorId !== "all" && bill.vendor_id !== filters.vendorId) {
          return false;
        }
        if (filters.category !== "all" && bill.category !== filters.category) {
          return false;
        }
        if (filters.status !== "all" && bill.status !== filters.status) {
          return false;
        }
        if (
          filters.aging !== "all" &&
          bill.status === "unpaid" &&
          getAgingBucket(bill.due_date) !== filters.aging
        ) {
          return false;
        }
        if (filters.aging !== "all" && bill.status === "paid") return false;
        if (filters.dueFrom && bill.due_date < filters.dueFrom) return false;
        if (filters.dueTo && bill.due_date > filters.dueTo) return false;
        if (minCents !== null && bill.amount_cents < minCents) return false;
        if (maxCents !== null && bill.amount_cents > maxCents) return false;
        if (filters.paidMonth && bill.status === "paid") {
          if (!bill.paid_date?.startsWith(filters.paidMonth)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (filters.sort === "due_asc") return a.due_date.localeCompare(b.due_date);
        if (filters.sort === "due_desc") return b.due_date.localeCompare(a.due_date);
        if (filters.sort === "amount_asc") return a.amount_cents - b.amount_cents;
        return b.amount_cents - a.amount_cents;
      });
  }, [data.bills, filters, selectedVendorId]);

  const unpaidBills = filteredBills.filter((bill) => bill.status === "unpaid");
  const paidBills = filteredBills.filter((bill) => bill.status === "paid");

  function openNewBill() {
    setEditingBill(null);
    setBillDialogOpen(true);
  }

  function openEditBill(bill: Bill) {
    setEditingBill(bill);
    setBillDialogOpen(true);
  }

  function openNewVendor() {
    setEditingVendor(null);
    setVendorDialogOpen(true);
  }

  function openEditVendor(vendor: BillVendorSummary) {
    setEditingVendor(vendor);
    setVendorDialogOpen(true);
  }

  function handleMarkPaid(bill: Bill) {
    startTransition(async () => {
      const result = await markBillPaid(bill.id);
      if (result?.error) {
        toast.error(typeof result.error === "string" ? result.error : "Couldn't mark bill paid");
        return;
      }
      const fresh = await getBillsDashboardData();
      if (fresh) setData(fresh);
      toast.success("Bill marked paid");
    });
  }

  const selectedVendor =
    selectedVendorId === "all"
      ? null
      : vendors.find((vendor) => vendor.id === selectedVendorId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Bills</h2>
          <p className="text-sm text-muted-foreground">
            Track unpaid invoices, vendor folders, and paid history.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={openNewVendor}>
            <Folder className="h-4 w-4" />
            Vendor
          </Button>
          <Button onClick={openNewBill}>
            <Plus className="h-4 w-4" />
            Bill
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={<WalletCards className="h-4 w-4" />}
          label="Total unpaid"
          value={formatCurrency(summary.total_unpaid_cents)}
        />
        <SummaryCard
          icon={<Check className="h-4 w-4" />}
          label="Paid this month"
          value={formatCurrency(summary.total_paid_this_month_cents)}
        />
        <SummaryCard
          icon={<CalendarDays className="h-4 w-4" />}
          label="Due this week"
          value={String(summary.due_this_week.length)}
        />
        <SummaryCard
          icon={<ReceiptText className="h-4 w-4" />}
          label="Overdue"
          value={String(summary.overdue.length)}
          tone={summary.overdue.length > 0 ? "danger" : "default"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
        <VendorFolders
          vendors={vendors}
          selectedVendorId={selectedVendorId}
          onSelect={setSelectedVendorId}
          onEdit={openEditVendor}
        />

        <div className="space-y-4 min-w-0">
          <div className="grid gap-4 lg:grid-cols-3">
            <AgingBreakdown summary={summary} />
            <TotalsList
              title="Unpaid by vendor"
              rows={summary.unpaid_by_vendor.map((row) => ({
                key: row.vendor_id,
                label: row.vendor_name,
                value: formatCurrency(row.total_cents),
              }))}
            />
            <TotalsList
              title="Unpaid by category"
              rows={summary.unpaid_by_category.map((row) => ({
                key: row.category,
                label: row.category,
                value: formatCurrency(row.total_cents),
              }))}
            />
          </div>

          <BillFilters
            filters={filters}
            vendors={vendors}
            onChange={setFilters}
            onReset={() => setFilters(DEFAULT_FILTERS)}
          />

          {selectedVendor && (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
              <Folder className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{selectedVendor.name}</span>
              <span className="text-muted-foreground">
                {selectedVendor.unpaid_count} unpaid ·{" "}
                {formatCurrency(selectedVendor.unpaid_total_cents)}
              </span>
            </div>
          )}

          <BillsTable
            title="Unpaid bills"
            bills={unpaidBills}
            empty="No unpaid bills match these filters."
            isPending={isPending}
            onEdit={openEditBill}
            onMarkPaid={handleMarkPaid}
          />

          <BillsTable
            title="Paid history"
            bills={paidBills}
            empty="No paid bills match these filters."
            isPending={isPending}
            onEdit={openEditBill}
          />
        </div>
      </div>

      <BillFormDialog
        key={billDialogOpen ? editingBill?.id ?? `new-${selectedVendorId}` : "bill-closed"}
        open={billDialogOpen}
        onOpenChange={setBillDialogOpen}
        vendors={vendors}
        bill={editingBill}
        selectedVendorId={selectedVendorId}
        onSaved={(fresh) => {
          setData(fresh);
          setBillDialogOpen(false);
          toast.success(editingBill ? "Bill updated" : "Bill created");
        }}
      />

      <VendorFormDialog
        key={vendorDialogOpen ? editingVendor?.id ?? "new-vendor" : "vendor-closed"}
        open={vendorDialogOpen}
        onOpenChange={setVendorDialogOpen}
        vendor={editingVendor}
        onSaved={(fresh) => {
          setData(fresh);
          setVendorDialogOpen(false);
          toast.success(editingVendor ? "Vendor updated" : "Vendor created");
        }}
      />
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "default" | "danger";
}) {
  return (
    <Card size="sm">
      <CardContent>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p
              className={cn(
                "mt-1 text-2xl font-semibold tabular-nums",
                tone === "danger" && "text-destructive",
              )}
            >
              {value}
            </p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function VendorFolders({
  vendors,
  selectedVendorId,
  onSelect,
  onEdit,
}: {
  vendors: BillVendorSummary[];
  selectedVendorId: string;
  onSelect: (id: string) => void;
  onEdit: (vendor: BillVendorSummary) => void;
}) {
  const totalUnpaid = vendors.reduce(
    (sum, vendor) => sum + vendor.unpaid_total_cents,
    0,
  );

  return (
    <Card className="h-fit" size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Folder className="h-4 w-4" />
          Vendor folders
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <button
          type="button"
          onClick={() => onSelect("all")}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted",
            selectedVendorId === "all" && "bg-primary/10 text-primary",
          )}
        >
          <span className="font-medium">All vendors</span>
          <span className="text-xs tabular-nums">{formatCurrency(totalUnpaid)}</span>
        </button>
        {vendors.map((vendor) => (
          <div
            key={vendor.id}
            className={cn(
              "group flex items-center gap-1 rounded-lg",
              selectedVendorId === vendor.id && "bg-primary/10 text-primary",
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(vendor.id)}
              className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted"
            >
              <span className="min-w-0 truncate font-medium">
                {vendor.name}
                {vendor.is_misc && (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    default
                  </span>
                )}
              </span>
              <span className="text-xs tabular-nums">
                {formatCurrency(vendor.unpaid_total_cents)}
              </span>
            </button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onEdit(vendor)}
              aria-label={`Edit ${vendor.name}`}
              className="mr-1 opacity-70 group-hover:opacity-100"
            >
              <Pencil className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function AgingBreakdown({ summary }: { summary: BillsDashboardData["summary"] }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Aging buckets</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {BILL_AGING_BUCKETS.map((bucket) => (
          <div key={bucket} className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">
              {BILL_AGING_LABELS[bucket]}
            </span>
            <span className="font-medium tabular-nums">
              {formatCurrency(summary.unpaid_by_aging[bucket])}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function TotalsList({
  title,
  rows,
}: {
  title: string;
  rows: { key: string; label: string; value: string }[];
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No unpaid bills.</p>
        ) : (
          rows.slice(0, 6).map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-muted-foreground">
                {row.label}
              </span>
              <span className="font-medium tabular-nums">{row.value}</span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function BillFilters({
  filters,
  vendors,
  onChange,
  onReset,
}: {
  filters: Filters;
  vendors: BillVendorSummary[];
  onChange: (filters: Filters) => void;
  onReset: () => void;
}) {
  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <Card size="sm">
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <Select value={filters.vendorId} onValueChange={(value) => set("vendorId", value ?? "all")}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All vendors</SelectItem>
              {vendors.map((vendor) => (
                <SelectItem key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.category} onValueChange={(value) => set("category", value ?? "all")}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {BILL_CATEGORIES.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.aging} onValueChange={(value) => set("aging", value ?? "all")}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All aging</SelectItem>
              {BILL_AGING_BUCKETS.map((bucket) => (
                <SelectItem key={bucket} value={bucket}>
                  {BILL_AGING_LABELS[bucket]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.status} onValueChange={(value) => set("status", value ?? "all")}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="unpaid">Unpaid</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filters.sort} onValueChange={(value) => set("sort", (value ?? "due_asc") as BillSort)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="due_asc">Due date ↑</SelectItem>
              <SelectItem value="due_desc">Due date ↓</SelectItem>
              <SelectItem value="amount_asc">Amount ↑</SelectItem>
              <SelectItem value="amount_desc">Amount ↓</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="ghost" onClick={onReset}>
            Reset
          </Button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <FilterInput
            label="Due from"
            type="date"
            value={filters.dueFrom}
            onChange={(value) => set("dueFrom", value)}
          />
          <FilterInput
            label="Due to"
            type="date"
            value={filters.dueTo}
            onChange={(value) => set("dueTo", value)}
          />
          <FilterInput
            label="Min amount"
            type="number"
            value={filters.amountMin}
            onChange={(value) => set("amountMin", value)}
          />
          <FilterInput
            label="Max amount"
            type="number"
            value={filters.amountMax}
            onChange={(value) => set("amountMax", value)}
          />
          <FilterInput
            label="Paid month"
            type="month"
            value={filters.paidMonth}
            onChange={(value) => set("paidMonth", value)}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function FilterInput({
  label,
  type,
  value,
  onChange,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <Label className="mb-1 text-xs text-muted-foreground">{label}</Label>
      <Input
        type={type}
        value={value}
        min={type === "number" ? "0" : undefined}
        step={type === "number" ? "0.01" : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function BillsTable({
  title,
  bills,
  empty,
  isPending,
  onEdit,
  onMarkPaid,
}: {
  title: string;
  bills: Bill[];
  empty: string;
  isPending: boolean;
  onEdit: (bill: Bill) => void;
  onMarkPaid?: (bill: Bill) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {bills.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Aging</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bills.map((bill) => {
                const bucket = getAgingBucket(bill.due_date);
                return (
                  <TableRow key={bill.id}>
                    <TableCell className="font-medium">
                      {bill.vendor?.name ?? "Unknown vendor"}
                    </TableCell>
                    <TableCell>{bill.category}</TableCell>
                    <TableCell>{formatDateLabel(bill.invoice_date)}</TableCell>
                    <TableCell>{formatDateLabel(bill.due_date)}</TableCell>
                    <TableCell>
                      {bill.status === "unpaid" ? (
                        <AgingBadge bucket={bucket} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatCurrency(bill.amount_cents)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={bill.status === "paid" ? "secondary" : "outline"}>
                        {bill.status === "paid"
                          ? `Paid ${formatDateLabel(bill.paid_date)}`
                          : "Unpaid"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => onEdit(bill)}
                          aria-label="Edit bill"
                          disabled={isPending}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {bill.status === "unpaid" && onMarkPaid && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onMarkPaid(bill)}
                            disabled={isPending}
                          >
                            <Check className="h-3.5 w-3.5" />
                            Mark paid
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function AgingBadge({ bucket }: { bucket: BillAgingBucket }) {
  const variant = bucket === "current" ? "secondary" : "destructive";
  return <Badge variant={variant}>{BILL_AGING_LABELS[bucket]}</Badge>;
}

function BillFormDialog({
  open,
  onOpenChange,
  vendors,
  bill,
  selectedVendorId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendors: BillVendorSummary[];
  bill: Bill | null;
  selectedVendorId: string;
  onSaved: (data: BillsDashboardData) => void;
}) {
  const defaultVendor =
    selectedVendorId !== "all"
      ? selectedVendorId
      : vendors.find((vendor) => vendor.is_misc)?.id ?? vendors[0]?.id ?? "";
  const [vendorId, setVendorId] = useState(bill?.vendor_id ?? defaultVendor);
  const [category, setCategory] = useState<BillCategory>(
    bill?.category ?? "Miscellaneous",
  );
  const [invoiceDate, setInvoiceDate] = useState(
    bill?.invoice_date ?? todayString(),
  );
  const [dueDate, setDueDate] = useState(bill?.due_date ?? todayString());
  const [amount, setAmount] = useState(
    bill ? String((bill.amount_cents / 100).toFixed(2)) : "",
  );
  const [notes, setNotes] = useState(bill?.notes ?? "");
  const [status, setStatus] = useState<BillStatus>(bill?.status ?? "unpaid");
  const [paidDate, setPaidDate] = useState(bill?.paid_date ?? todayString());
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!vendorId) {
      toast.error("Pick a vendor");
      return;
    }
    const amountCents = parseDollarAmountToCents(amount);
    if (!Number.isFinite(amountCents)) {
      toast.error("Enter a valid amount");
      return;
    }
    const payload = {
      vendor_id: vendorId,
      category,
      invoice_date: invoiceDate,
      due_date: dueDate,
      amount_cents: amountCents,
      notes: notes.trim() || null,
      status,
      paid_date: status === "paid" ? paidDate : null,
    };
    startTransition(async () => {
      const result = bill ? await updateBill(bill.id, payload) : await createBill(payload);
      if (result?.error) {
        toast.error(typeof result.error === "string" ? result.error : "Couldn't save bill");
        return;
      }
      const fresh = await getBillsDashboardData();
      if (fresh) onSaved(fresh);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{bill ? "Edit bill" : "New bill"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1 text-xs">Vendor</Label>
              <Select value={vendorId} onValueChange={(value) => setVendorId(value ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((vendor) => (
                    <SelectItem key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 text-xs">Category</Label>
              <Select value={category} onValueChange={(value) => setCategory((value ?? "Miscellaneous") as BillCategory)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BILL_CATEGORIES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label className="mb-1 text-xs">Invoice date</Label>
              <Input
                type="date"
                value={invoiceDate}
                onChange={(event) => setInvoiceDate(event.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1 text-xs">Due date</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1 text-xs">Amount</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1 text-xs">Status</Label>
              <Select
                value={status}
                onValueChange={(value) => {
                  const next = (value ?? "unpaid") as BillStatus;
                  setStatus(next);
                  if (next === "paid" && !paidDate) setPaidDate(todayString());
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 text-xs">Paid date</Label>
              <Input
                type="date"
                value={paidDate}
                disabled={status === "unpaid"}
                onChange={(event) => setPaidDate(event.target.value)}
              />
            </div>
          </div>

          <div>
            <Label className="mb-1 text-xs">Notes</Label>
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              placeholder="Invoice number, payment link, or context..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={isPending}>
            {bill ? "Save bill" : "Create bill"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VendorFormDialog({
  open,
  onOpenChange,
  vendor,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendor: BillVendorSummary | null;
  onSaved: (data: BillsDashboardData) => void;
}) {
  const [name, setName] = useState(vendor?.name ?? "");
  const [notes, setNotes] = useState(vendor?.notes ?? "");
  const [isPending, startTransition] = useTransition();

  function submit() {
    const payload = { name, notes: notes.trim() || null };
    startTransition(async () => {
      const result = vendor
        ? await updateBillVendor(vendor.id, payload)
        : await createBillVendor(payload);
      if (result?.error) {
        toast.error(typeof result.error === "string" ? result.error : "Couldn't save vendor");
        return;
      }
      const fresh = await getBillsDashboardData();
      if (fresh) onSaved(fresh);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{vendor ? "Edit vendor" : "New vendor"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="mb-1 text-xs">Vendor name</Label>
            <Input
              value={name}
              disabled={vendor?.is_misc}
              onChange={(event) => setName(event.target.value)}
              placeholder="Vendor name"
            />
          </div>
          <div>
            <Label className="mb-1 text-xs">Notes</Label>
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              placeholder="Contact, account number, or recurring details..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={isPending}>
            {vendor ? "Save vendor" : "Create vendor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
