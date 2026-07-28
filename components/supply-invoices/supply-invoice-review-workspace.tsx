"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Download,
  FileSearch,
  Loader2,
  RotateCcw,
  Save,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  approveSupplyInvoice,
  extractSupplyInvoice,
  rejectSupplyInvoice,
  saveSupplyInvoiceReview,
  type SupplyInvoiceReviewDetail,
} from "@/actions/supply-invoices";
import {
  buildInitialInvoiceReview,
  suggestCatalogMatch,
  type SupplyInvoiceReviewDraft,
} from "@/lib/supply-invoice-review";
import type { SupplyCatalogItem } from "@/lib/supply-ordering";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";

const STATUS_LABELS: Record<string, string> = {
  needs_review: "Needs review",
  exact_match: "Exact matches proposed",
  possible_match: "Possible matches",
  new_catalog_item: "Unmatched items",
  reconciled: "Reconciled",
  rejected: "Rejected",
  parser_error: "Extraction failed",
};

function money(cents: number | null, currency = "USD") {
  if (cents === null) return "Not found";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

function centsFromInput(value: string) {
  if (value.trim() === "") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

function extractionCost(micros: number | null) {
  if (micros === null) return "Cost unavailable";
  return `~$${(micros / 1_000_000).toFixed(4)}`;
}

export function SupplyInvoiceReviewWorkspace({
  invoice,
  catalog,
}: {
  invoice: SupplyInvoiceReviewDetail;
  catalog: SupplyCatalogItem[];
}) {
  const router = useRouter();
  const extraction = invoice.extraction;
  const initialDraft =
    invoice.review_draft ??
    (extraction ? buildInitialInvoiceReview(extraction, catalog) : null);
  const [draft, setDraft] = useState<SupplyInvoiceReviewDraft | null>(
    initialDraft,
  );
  const [pending, startTransition] = useTransition();
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const isClosed =
    invoice.status === "reconciled" || invoice.status === "rejected";
  const pdf = invoice.attachments.find(
    (attachment) =>
      attachment.content_type === "application/pdf" ||
      attachment.filename?.toLowerCase().endsWith(".pdf"),
  );
  const evidenceUrl = pdf
    ? `/api/supply-invoices/${invoice.id}/attachments/${pdf.id}`
    : null;
  const catalogById = useMemo(
    () => new Map(catalog.map((item) => [item.id, item])),
    [catalog],
  );
  const selectedCount =
    draft?.lines.filter((line) => line.apply_price).length ?? 0;

  function updateLine(
    lineId: string,
    patch: Partial<SupplyInvoiceReviewDraft["lines"][number]>,
  ) {
    setDraft((current) =>
      current
        ? {
            ...current,
            lines: current.lines.map((line) =>
              line.line_id === lineId ? { ...line, ...patch } : line,
            ),
          }
        : current,
    );
  }

  function run(
    action: () => Promise<{ error?: string; success?: boolean }>,
    successMessage: string,
    onSuccess?: () => void,
  ) {
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(successMessage);
      onSuccess?.();
      router.refresh();
    });
  }

  const summary = extraction
    ? [
        ["Invoice", extraction.invoice_number ?? "Not found"],
        ["Date", extraction.invoice_date ?? "Not found"],
        ["Subtotal", money(extraction.subtotal_cents, extraction.currency)],
        ["Tax", money(extraction.tax_cents, extraction.currency)],
        ["Shipping", money(extraction.shipping_cents, extraction.currency)],
        ["Total", money(extraction.total_cents, extraction.currency)],
      ]
    : [];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-y py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {STATUS_LABELS[invoice.status] ?? invoice.status}
          </Badge>
          <span className="text-sm text-muted-foreground">
            Received{" "}
            {new Intl.DateTimeFormat("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
              timeZone: "America/Phoenix",
            }).format(new Date(invoice.received_at))}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {evidenceUrl && (
            <Button
              variant="outline"
              render={<a href={evidenceUrl} target="_blank" rel="noreferrer" />}
            >
              <Download />
              Open PDF
            </Button>
          )}
          {!isClosed && (
            <Button
              variant="destructive"
              onClick={() => setRejectOpen(true)}
              disabled={pending}
            >
              <X />
              Reject
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(520px,0.95fr)]">
        <section className="min-w-0">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Original invoice</h2>
            <span className="text-xs text-muted-foreground">
              Read-only evidence
            </span>
          </div>
          {evidenceUrl ? (
            <iframe
              title="Supply invoice PDF"
              src={evidenceUrl}
              className="h-[72vh] min-h-[620px] w-full rounded-md border bg-muted"
            />
          ) : (
            <div className="flex min-h-[620px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
              No PDF evidence is available.
            </div>
          )}
        </section>

        <section className="min-w-0 space-y-5">
          {!extraction ? (
            <div className="flex min-h-72 flex-col items-center justify-center rounded-md border border-dashed px-6 text-center">
              <FileSearch className="h-8 w-8 text-muted-foreground" />
              <h2 className="mt-3 font-semibold">Extract invoice details</h2>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                AI will read the PDF and propose line-item matches. Nothing in
                the supply catalog changes during extraction.
              </p>
              <Button
                className="mt-4"
                onClick={() =>
                  run(
                    () => extractSupplyInvoice(invoice.id),
                    "Invoice extracted",
                  )
                }
                disabled={pending || !evidenceUrl || isClosed}
              >
                {pending ? <Loader2 className="animate-spin" /> : <FileSearch />}
                {invoice.status === "parser_error"
                  ? "Retry extraction"
                  : "Extract invoice"}
              </Button>
            </div>
          ) : (
            <>
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold">Invoice details</h2>
                    <p className="text-xs text-muted-foreground">
                      Extracted with {invoice.extraction_model ?? "AI"}
                    </p>
                    {invoice.extraction_usage && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {invoice.extraction_usage.input_tokens.toLocaleString()}{" "}
                        input ·{" "}
                        {invoice.extraction_usage.output_tokens.toLocaleString()}{" "}
                        output ·{" "}
                        {extractionCost(
                          invoice.extraction_usage.estimated_cost_micros,
                        )}
                      </p>
                    )}
                  </div>
                  {!isClosed && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        run(
                          () => extractSupplyInvoice(invoice.id),
                          "Invoice extracted again",
                        )
                      }
                      disabled={pending}
                      title="Extract again"
                    >
                      <RotateCcw />
                      Re-extract
                    </Button>
                  )}
                </div>
                <dl className="grid grid-cols-2 border-y sm:grid-cols-3">
                  {summary.map(([label, value]) => (
                    <div key={label} className="border-b px-3 py-2 last:border-b-0">
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="mt-0.5 text-sm font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div>
                <div className="mb-3">
                  <h2 className="font-semibold">Line-item reconciliation</h2>
                  <p className="text-sm text-muted-foreground">
                    Confirm the catalog item, verify its unit basis, then select
                    only the prices you want to update.
                  </p>
                </div>
                <div className="space-y-3">
                  {extraction.line_items.map((line) => {
                    const reviewLine = draft?.lines.find(
                      (entry) => entry.line_id === line.line_id,
                    );
                    const suggestion = suggestCatalogMatch(line, catalog);
                    const matched = reviewLine?.catalog_item_id
                      ? catalogById.get(reviewLine.catalog_item_id)
                      : null;
                    const proposed = reviewLine?.proposed_unit_cost_cents ?? null;
                    return (
                      <div
                        key={line.line_id}
                        className="rounded-md border p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="font-medium">{line.description}</h3>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {line.sku ? `SKU ${line.sku} · ` : ""}
                              Qty {line.quantity ?? "?"}{" "}
                              {line.unit_label ?? ""} · invoice unit{" "}
                              {money(line.unit_cost_cents, extraction.currency)}
                            </p>
                          </div>
                          <Badge variant="outline">
                            {Math.round(line.confidence * 100)}% read
                          </Badge>
                        </div>

                        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_130px]">
                          <div>
                            <Label htmlFor={`catalog-${line.line_id}`}>
                              Catalog item
                            </Label>
                            <Select
                              value={reviewLine?.catalog_item_id ?? "__none"}
                              onValueChange={(value) =>
                                updateLine(line.line_id, {
                                  catalog_item_id:
                                    value === "__none" ? null : value,
                                  apply_price:
                                    value === "__none"
                                      ? false
                                      : reviewLine?.apply_price ?? false,
                                })
                              }
                              disabled={isClosed}
                            >
                              <SelectTrigger
                                id={`catalog-${line.line_id}`}
                                className="mt-1 w-full"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none">
                                  No catalog match
                                </SelectItem>
                                {catalog.map((item) => (
                                  <SelectItem key={item.id} value={item.id}>
                                    {item.name} · {item.vendor}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {suggestion.catalog_item_id && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                Proposed from{" "}
                                {suggestion.reason === "sku"
                                  ? "matching SKU"
                                  : suggestion.reason.replace("_", " ")}
                              </p>
                            )}
                          </div>
                          <div>
                            <Label htmlFor={`price-${line.line_id}`}>
                              New unit price
                            </Label>
                            <Input
                              id={`price-${line.line_id}`}
                              className="mt-1"
                              type="number"
                              min="0"
                              step="0.01"
                              value={
                                proposed === null ? "" : (proposed / 100).toFixed(2)
                              }
                              onChange={(event) =>
                                updateLine(line.line_id, {
                                  proposed_unit_cost_cents: centsFromInput(
                                    event.target.value,
                                  ),
                                })
                              }
                              disabled={isClosed}
                            />
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                          <div className="text-sm">
                            Current catalog price:{" "}
                            <span className="font-medium">
                              {matched
                                ? money(
                                    matched.current_unit_cost_cents,
                                    extraction.currency,
                                  )
                                : "No match"}
                            </span>
                            {matched &&
                              proposed !== null &&
                              matched.current_unit_cost_cents !== null && (
                                <span className="ml-2 text-muted-foreground">
                                  {proposed >= matched.current_unit_cost_cents
                                    ? "+"
                                    : ""}
                                  {money(
                                    proposed - matched.current_unit_cost_cents,
                                    extraction.currency,
                                  )}
                                </span>
                              )}
                          </div>
                          <Label className="flex cursor-pointer items-center gap-2">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-primary"
                              checked={reviewLine?.apply_price ?? false}
                              onChange={(event) =>
                                updateLine(line.line_id, {
                                  apply_price: event.target.checked,
                                })
                              }
                              disabled={
                                isClosed ||
                                !reviewLine?.catalog_item_id ||
                                proposed === null
                              }
                            />
                            Apply this price
                          </Label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <Label htmlFor="review-notes">Review notes</Label>
                <Textarea
                  id="review-notes"
                  className="mt-1 min-h-20"
                  value={draft?.notes ?? ""}
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, notes: event.target.value } : current,
                    )
                  }
                  disabled={isClosed}
                  placeholder="Optional internal notes"
                />
              </div>

              {isClosed ? (
                <div className="flex items-start gap-3 rounded-md border p-4">
                  {invoice.status === "reconciled" ? (
                    <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-600" />
                  ) : (
                    <X className="mt-0.5 h-5 w-5 text-destructive" />
                  )}
                  <div>
                    <p className="font-medium">
                      {invoice.status === "reconciled"
                        ? "Price changes reconciled"
                        : "Invoice rejected"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {invoice.status === "reconciled"
                        ? `${invoice.approved_changes?.length ?? 0} catalog price change(s) were recorded.`
                        : invoice.rejection_reason}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="sticky bottom-3 flex flex-wrap justify-end gap-2 rounded-md border bg-background/95 p-3 shadow-sm backdrop-blur">
                  <Button
                    variant="outline"
                    onClick={() =>
                      draft &&
                      run(
                        () => saveSupplyInvoiceReview(invoice.id, draft),
                        "Review saved; no prices changed",
                      )
                    }
                    disabled={pending || !draft}
                  >
                    <Save />
                    Save review
                  </Button>
                  <Button
                    onClick={() => setApproveOpen(true)}
                    disabled={pending || selectedCount === 0}
                  >
                    <Check />
                    Approve {selectedCount || ""} price
                    {selectedCount === 1 ? "" : "s"}
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Update {selectedCount} catalog price(s)?</DialogTitle>
            <DialogDescription>
              This writes the selected prices to the live supply catalog,
              preserves each old price, and records this invoice as the evidence.
              Procedure costs linked to those supplies will use the new prices.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                draft &&
                run(
                  () => approveSupplyInvoice(invoice.id, draft),
                  "Catalog prices updated",
                  () => setApproveOpen(false),
                )
              }
              disabled={pending || !draft}
            >
              {pending ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
              Confirm updates
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject this invoice</DialogTitle>
            <DialogDescription>
              Rejection closes the review without changing any catalog prices.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="rejection-reason">Reason</Label>
            <Textarea
              id="rejection-reason"
              className="mt-1 min-h-24"
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
              placeholder="Duplicate invoice, non-supply purchase, incorrect vendor..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                run(
                  () => rejectSupplyInvoice(invoice.id, rejectionReason),
                  "Invoice rejected",
                  () => setRejectOpen(false),
                )
              }
              disabled={pending || !rejectionReason.trim()}
            >
              {pending ? <Loader2 className="animate-spin" /> : <X />}
              Reject invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
