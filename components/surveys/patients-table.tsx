"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { EnrollDialog } from "@/components/surveys/enroll-dialog";
import { deletePatients } from "@/actions/surveys";
import { patientLabel } from "@/lib/survey/label";
import { cn } from "@/lib/utils";
import type { PatientListItem, SurveyCampaign } from "@/lib/types";
import { Trash2, Users } from "lucide-react";

function monthsBetween(dateIso: string | null, refMs: number): number | null {
  if (!dateIso) return null;
  const then = new Date(dateIso + "T00:00:00").getTime();
  return (refMs - then) / (1000 * 60 * 60 * 24 * 30.44);
}

function fmtMoney(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

const LAPSED_MONTHS = 6;
const NEW_MONTHS = 6;

export function PatientsTable({
  patients,
  campaigns,
  asOf,
}: {
  patients: PatientListItem[];
  campaigns: SurveyCampaign[];
  /** Date the data reflects (latest visit). Recency is measured against this,
   *  not today, so a stale export doesn't make everyone look lapsed. */
  asOf?: string;
}) {
  // Reference point for recency: the data's as-of date, falling back to today.
  // `now` is captured once (lazy init) to keep render pure.
  const [now] = useState(() => Date.now());
  const refMs = asOf ? new Date(asOf + "T00:00:00").getTime() : now;
  const [search, setSearch] = useState("");
  const [minDollars, setMinDollars] = useState("");
  const [lapsedOnly, setLapsedOnly] = useState(false);
  const [repeatOnly, setRepeatOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const router = useRouter();

  // Top-value threshold = 80th percentile of collections (for the 💰 badge).
  const topValueThreshold = useMemo(() => {
    const vals = patients
      .map((p) => p.total_collected_cents)
      .filter((v) => v > 0)
      .sort((a, b) => a - b);
    if (vals.length === 0) return Infinity;
    return vals[Math.floor(vals.length * 0.8)] ?? Infinity;
  }, [patients]);

  const filtered = useMemo(() => {
    const minCents = minDollars ? parseFloat(minDollars) * 100 : 0;
    const q = search.trim().toLowerCase();
    return patients.filter((p) => {
      if (q && !patientLabel(p).toLowerCase().includes(q)) return false;
      if (minCents && p.total_collected_cents < minCents) return false;
      if (repeatOnly && p.visit_count <= 1) return false;
      if (lapsedOnly) {
        const m = monthsBetween(p.last_seen, refMs);
        if (m === null || m < LAPSED_MONTHS) return false;
      }
      return true;
    });
  }, [patients, search, minDollars, repeatOnly, lapsedOnly, refMs]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((p) => selected.has(p.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach((p) => next.delete(p.id));
      else filtered.forEach((p) => next.add(p.id));
      return next;
    });
  }

  const enrolledSelectedCount = useMemo(
    () =>
      patients.filter(
        (p) => selected.has(p.id) && p.enrolledCampaignIds.length > 0
      ).length,
    [patients, selected]
  );

  async function handleRemove() {
    setRemoving(true);
    const res = await deletePatients([...selected]);
    setRemoving(false);
    if (res.error) {
      toast.error(typeof res.error === "string" ? res.error : "Could not remove");
      return;
    }
    toast.success(
      `Removed ${res.removed} patient${res.removed === 1 ? "" : "s"}`
    );
    setSelected(new Set());
    setRemoveOpen(false);
    router.refresh();
  }

  function segments(p: PatientListItem) {
    const out: { label: string; className: string }[] = [];
    if (p.total_collected_cents >= topValueThreshold && p.total_collected_cents > 0)
      out.push({ label: "💰 Top value", className: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" });
    const lm = monthsBetween(p.last_seen, refMs);
    if (lm !== null && lm >= LAPSED_MONTHS)
      out.push({ label: "⏰ Lapsed", className: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" });
    if (p.visit_count > 1)
      out.push({ label: "🔁 Repeat", className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400" });
    const fm = monthsBetween(p.first_seen, refMs);
    if (fm !== null && fm <= NEW_MONTHS)
      out.push({ label: "🌱 New", className: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400" });
    return out;
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search id…"
          className="w-48"
        />
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-muted-foreground">Min $</span>
          <Input
            type="number"
            min={0}
            value={minDollars}
            onChange={(e) => setMinDollars(e.target.value)}
            placeholder="0"
            className="w-24"
          />
        </div>
        <Button
          variant={lapsedOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setLapsedOnly((v) => !v)}
        >
          ⏰ Lapsed 6mo+
        </Button>
        <Button
          variant={repeatOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setRepeatOnly((v) => !v)}
        >
          🔁 Repeat
        </Button>

        <div className="ml-auto flex items-center gap-2">
          {asOf && (
            <span className="text-xs text-muted-foreground">
              recency as of{" "}
              {new Date(asOf + "T00:00:00").toLocaleDateString()}
            </span>
          )}
          <span className="text-sm text-muted-foreground">
            {selected.size} selected · {filtered.length} shown
          </span>
          <Button
            disabled={selected.size === 0}
            onClick={() => setEnrollOpen(true)}
          >
            <Users className="mr-1.5 h-4 w-4" />
            Enroll selected
          </Button>
          <Button
            variant="outline"
            disabled={selected.size === 0}
            className="text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setRemoveOpen(true)}
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            Remove
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleAllFiltered}
                  aria-label="Select all shown"
                />
              </TableHead>
              <TableHead>Patient</TableHead>
              <TableHead className="text-right">Collected</TableHead>
              <TableHead className="text-right">Visits</TableHead>
              <TableHead>Last visit</TableHead>
              <TableHead>Segments</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  No patients match these filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.slice(0, 500).map((p) => {
                const isSel = selected.has(p.id);
                return (
                  <TableRow
                    key={p.id}
                    className={cn(isSel && "bg-primary/5")}
                  >
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => toggle(p.id)}
                        aria-label={`Select ${patientLabel(p)}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {patientLabel(p)}
                      {p.enrolledCampaignIds.length > 0 && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          · enrolled
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtMoney(p.total_collected_cents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.visit_count}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.last_seen
                        ? new Date(p.last_seen + "T00:00:00").toLocaleDateString()
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {segments(p).map((s) => (
                          <Badge key={s.label} className={s.className}>
                            {s.label}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        {filtered.length > 500 && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Showing first 500 of {filtered.length}. Narrow the filters or use
            “Select all shown” to enroll the whole filtered set.
          </p>
        )}
      </div>

      <EnrollDialog
        open={enrollOpen}
        onOpenChange={setEnrollOpen}
        campaigns={campaigns}
        selectedIds={[...selected]}
      />

      <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <DialogPortal>
          <DialogOverlay />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Remove {selected.size} patient{selected.size === 1 ? "" : "s"}?
              </DialogTitle>
              <DialogDescription>
                This permanently removes them from your patient list
                {enrolledSelectedCount > 0 && (
                  <>
                    {" "}
                    — including{" "}
                    <span className="font-medium text-foreground">
                      {enrolledSelectedCount} enrolled in campaigns
                    </span>
                    , whose survey codes, responses, and promised credits will
                    be deleted too
                  </>
                )}
                . Re-importing your CSV will bring them back as new entries.
                There is no undo.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose className="inline-flex items-center rounded-lg border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted">
                Cancel
              </DialogClose>
              <Button
                variant="destructive"
                disabled={removing}
                onClick={handleRemove}
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                {removing ? "Removing…" : "Remove patients"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </DialogPortal>
      </Dialog>
    </div>
  );
}
