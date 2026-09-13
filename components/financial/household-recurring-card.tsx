"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, ChevronUp, Repeat, RotateCcw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { setRecurringStreamStatus } from "@/actions/household-recurring";
import { formatCents } from "@/lib/household-finance";
import {
  compareStreams,
  summarizeRecurring,
  type HouseholdRecurringData,
  type RecurringStatus,
  type RecurringStream,
} from "@/lib/recurring-detection";
import { cn } from "@/lib/utils";

export function HouseholdRecurringCard({
  data,
  previewMode = false,
}: {
  data: HouseholdRecurringData;
  previewMode?: boolean;
}) {
  const [streams, setStreams] = useState<RecurringStream[]>(data.streams);
  const [showHidden, setShowHidden] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const summary = summarizeRecurring(streams);
  const sorted = [...streams].sort(compareStreams);
  const visible = sorted.filter((stream) => stream.status !== "dismissed" && stream.isActive);
  const hidden = sorted.filter((stream) => stream.status === "dismissed" || !stream.isActive);

  function updateStatus(stream: RecurringStream, status: RecurringStatus) {
    const previous = stream.status;
    setStreams((current) => current.map((item) => (item.key === stream.key ? { ...item, status } : item)));
    if (previewMode) return;
    setPendingKey(stream.key);
    startTransition(async () => {
      const result = await setRecurringStreamStatus({ streamKey: stream.key, status });
      setPendingKey(null);
      if ("error" in result) {
        setStreams((current) => current.map((item) => (item.key === stream.key ? { ...item, status: previous } : item)));
        toast.error(result.error);
      }
    });
  }

  return (
    <section className="overflow-hidden rounded-lg border bg-card" aria-labelledby="recurring-heading">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b px-5 py-4">
        <div>
          <h2 id="recurring-heading" className="flex items-center gap-2 font-semibold">
            <Repeat className="h-4 w-4 text-muted-foreground" aria-hidden />
            Recurring bills &amp; subscriptions
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Detected from {data.monthsAnalyzed} {data.monthsAnalyzed === 1 ? "month" : "months"}{" "}
            of activity. Confirm what&apos;s right, dismiss what isn&apos;t.
          </p>
        </div>
        <dl className="flex gap-6 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Expected per month</dt>
            <dd className="text-xl font-semibold">{formatCents(summary.monthlyCents)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Bills</dt>
            <dd className="text-xl font-semibold tabular-nums">{formatCents(summary.billsCents)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Subscriptions</dt>
            <dd className="text-xl font-semibold tabular-nums">{formatCents(summary.subscriptionsCents)}</dd>
          </div>
        </dl>
      </div>

      {visible.length === 0 ? (
        <div className="px-5 py-12 text-center text-sm text-muted-foreground">
          Nothing recurring detected yet. A charge needs to repeat at least three times on a steady cadence before it shows here.
        </div>
      ) : (
        <StreamTable streams={visible} pendingKey={pendingKey} onUpdate={updateStatus} />
      )}

      {hidden.length > 0 && (
        <div className="border-t">
          <button
            type="button"
            onClick={() => setShowHidden((value) => !value)}
            className="flex w-full items-center justify-between px-5 py-3 text-sm text-muted-foreground hover:text-foreground"
            aria-expanded={showHidden}
          >
            <span>
              {showHidden ? "Hide" : "Show"} {hidden.length} dismissed or ended {hidden.length === 1 ? "stream" : "streams"}
            </span>
            {showHidden ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showHidden && <StreamTable streams={hidden} pendingKey={pendingKey} onUpdate={updateStatus} muted />}
        </div>
      )}
    </section>
  );
}

function StreamTable({
  streams,
  pendingKey,
  onUpdate,
  muted = false,
}: {
  streams: RecurringStream[];
  pendingKey: string | null;
  onUpdate: (stream: RecurringStream, status: RecurringStatus) => void;
  muted?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead>Merchant</TableHead>
            <TableHead>Kind</TableHead>
            <TableHead>Cadence</TableHead>
            <TableHead className="text-right">Typical</TableHead>
            <TableHead className="text-right">Per month</TableHead>
            <TableHead>Last</TableHead>
            <TableHead>Next</TableHead>
            <TableHead className="text-right">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {streams.map((stream) => {
            const busy = pendingKey === stream.key;
            return (
              <TableRow key={stream.key} className={cn(muted && "text-muted-foreground")}>
                <TableCell className="max-w-64">
                  <span className="block truncate font-medium">{stream.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {stream.accountLabel} · {stream.categoryLabel} · {stream.occurrences}×
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-normal">{stream.kind === "bill" ? "Bill" : "Subscription"}</Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap">{stream.cadenceLabel}</TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {formatCents(stream.typicalAmountCents)}
                  {!stream.amountIsFixed && <span className="block text-xs text-muted-foreground">varies</span>}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{formatCents(stream.monthlyEquivalentCents)}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(stream.lastDate)}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {stream.isActive ? formatDate(stream.nextExpectedDate) : <span className="text-muted-foreground">Ended</span>}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {stream.status === "confirmed" && (
                      <>
                        <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300" variant="outline">
                          Confirmed
                        </Badge>
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => onUpdate(stream, "detected")} aria-label={`Undo confirm ${stream.label}`}>
                          <RotateCcw className="h-3.5 w-3.5" /> Undo
                        </Button>
                      </>
                    )}
                    {stream.status === "dismissed" && <Badge variant="secondary">Dismissed</Badge>}
                    {stream.status === "detected" && (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => onUpdate(stream, "confirmed")} aria-label={`Confirm ${stream.label}`}>
                        <Check className="h-3.5 w-3.5" /> Confirm
                      </Button>
                    )}
                    {stream.status !== "dismissed" ? (
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => onUpdate(stream, "dismissed")} aria-label={`Dismiss ${stream.label}`}>
                        <X className="h-3.5 w-3.5" /> Dismiss
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => onUpdate(stream, "detected")} aria-label={`Restore ${stream.label}`}>
                        <RotateCcw className="h-3.5 w-3.5" /> Restore
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00`));
}
