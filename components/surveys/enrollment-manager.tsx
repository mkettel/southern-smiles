"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  generateRecipients,
  unenrollPatients,
  unenrollAll,
} from "@/actions/surveys";
import { cn } from "@/lib/utils";
import type { PatientListItem } from "@/lib/types";
import { Users, Check } from "lucide-react";

function monthsBetween(dateIso: string | null, refMs: number): number | null {
  if (!dateIso) return null;
  return (refMs - new Date(dateIso + "T00:00:00").getTime()) / (1000 * 60 * 60 * 24 * 30.44);
}

type EnrolledFilter = "all" | "enrolled" | "not_enrolled";

export function EnrollmentManager({
  campaignId,
  patients,
  enrolledPatientIds,
  sentPatientIds,
  asOf,
}: {
  campaignId: string;
  patients: PatientListItem[];
  enrolledPatientIds: string[];
  sentPatientIds: string[];
  asOf?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [minDollars, setMinDollars] = useState("");
  const [lapsedOnly, setLapsedOnly] = useState(false);
  const [repeatOnly, setRepeatOnly] = useState(false);
  const [enrolledFilter, setEnrolledFilter] = useState<EnrolledFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [now] = useState(() => Date.now());

  const enrolled = useMemo(() => new Set(enrolledPatientIds), [enrolledPatientIds]);
  const sent = useMemo(() => new Set(sentPatientIds), [sentPatientIds]);
  const refMs = asOf ? new Date(asOf + "T00:00:00").getTime() : now;

  const filtered = useMemo(() => {
    const minCents = minDollars ? parseFloat(minDollars) * 100 : 0;
    const q = search.trim().toLowerCase();
    return patients.filter((p) => {
      if (q && !p.full_name.toLowerCase().includes(q)) return false;
      if (minCents && p.total_collected_cents < minCents) return false;
      if (repeatOnly && p.visit_count <= 1) return false;
      if (lapsedOnly) {
        const m = monthsBetween(p.last_seen, refMs);
        if (m === null || m < 6) return false;
      }
      const isEnrolled = enrolled.has(p.id);
      if (enrolledFilter === "enrolled" && !isEnrolled) return false;
      if (enrolledFilter === "not_enrolled" && isEnrolled) return false;
      return true;
    });
  }, [patients, search, minDollars, repeatOnly, lapsedOnly, enrolledFilter, refMs, enrolled]);

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
  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach((p) => next.delete(p.id));
      else filtered.forEach((p) => next.add(p.id));
      return next;
    });
  }

  async function run(
    key: string,
    fn: () => Promise<{ error?: unknown } & Record<string, unknown>>,
    ok: (r: Record<string, unknown>) => string
  ) {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (res.error) {
      toast.error(typeof res.error === "string" ? res.error : "Something went wrong");
      return;
    }
    toast.success(ok(res));
    setSelected(new Set());
    router.refresh();
  }

  const selectedIds = [...selected];
  const selectedToEnroll = selectedIds.filter((id) => !enrolled.has(id));
  const selectedToUnenroll = selectedIds.filter(
    (id) => enrolled.has(id) && !sent.has(id)
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-transparent bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-colors"
      >
        <Users className="h-4 w-4" />
        Manage enrollment
      </DialogTrigger>
      <DialogPortal>
        <DialogOverlay />
        <DialogContent className="flex max-h-[88vh] flex-col sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage enrollment</DialogTitle>
            <DialogDescription>
              Search and filter to a segment, then enroll or unenroll a subset —
              or everyone. Sent patients can&apos;t be unenrolled.
            </DialogDescription>
          </DialogHeader>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name…"
              className="w-40"
            />
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">Min $</span>
              <Input
                type="number"
                min={0}
                value={minDollars}
                onChange={(e) => setMinDollars(e.target.value)}
                placeholder="0"
                className="w-20"
              />
            </div>
            <Button
              variant={lapsedOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setLapsedOnly((v) => !v)}
            >
              ⏰ Lapsed
            </Button>
            <Button
              variant={repeatOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setRepeatOnly((v) => !v)}
            >
              🔁 Repeat
            </Button>
            <select
              value={enrolledFilter}
              onChange={(e) => setEnrolledFilter(e.target.value as EnrolledFilter)}
              className="rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              <option value="all">All</option>
              <option value="not_enrolled">Not enrolled</option>
              <option value="enrolled">Enrolled</option>
            </select>
          </div>

          {/* Select-all + count */}
          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-muted-foreground">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={toggleAll}
              />
              Select all shown
            </label>
            <span className="text-muted-foreground">
              {selected.size} selected · {filtered.length} shown
            </span>
          </div>

          {/* List */}
          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border">
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No patients match these filters.
              </p>
            ) : (
              filtered.slice(0, 500).map((p) => {
                const isEnrolled = enrolled.has(p.id);
                const isSent = sent.has(p.id);
                return (
                  <label
                    key={p.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 border-b px-3 py-2 text-sm last:border-0 hover:bg-muted/50",
                      selected.has(p.id) && "bg-primary/5"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggle(p.id)}
                    />
                    <span className="flex-1 font-medium">{p.full_name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      ${Math.round(p.total_collected_cents / 100).toLocaleString()}
                    </span>
                    {isSent ? (
                      <Badge className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400">
                        <Check className="mr-0.5 h-3 w-3" /> Sent
                      </Badge>
                    ) : isEnrolled ? (
                      <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400">
                        Enrolled
                      </Badge>
                    ) : (
                      <Badge className="bg-muted text-muted-foreground">—</Badge>
                    )}
                  </label>
                );
              })
            )}
            {filtered.length > 500 && (
              <p className="py-2 text-center text-xs text-muted-foreground">
                Showing first 500 of {filtered.length}. Narrow the filters.
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <Button
              disabled={busy !== null || selectedToEnroll.length === 0}
              onClick={() =>
                run(
                  "enrollSel",
                  () => generateRecipients(campaignId, selectedToEnroll),
                  (r) => `Enrolled ${r.created} patient${r.created === 1 ? "" : "s"}`
                )
              }
            >
              {busy === "enrollSel"
                ? "Enrolling…"
                : `Enroll selected (${selectedToEnroll.length})`}
            </Button>
            <Button
              variant="outline"
              disabled={busy !== null || selectedToUnenroll.length === 0}
              onClick={() =>
                run(
                  "unenrollSel",
                  () => unenrollPatients(campaignId, selectedToUnenroll),
                  (r) => `Unenrolled ${r.removed} patient${r.removed === 1 ? "" : "s"}`
                )
              }
            >
              {busy === "unenrollSel"
                ? "Removing…"
                : `Unenroll selected (${selectedToUnenroll.length})`}
            </Button>

            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={() =>
                  run(
                    "enrollAll",
                    () => generateRecipients(campaignId),
                    (r) => `Enrolled ${r.created} patient${r.created === 1 ? "" : "s"}`
                  )
                }
              >
                Enroll all
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={() => {
                  if (!window.confirm("Unenroll all patients not yet sent?")) return;
                  run(
                    "unenrollAll",
                    () => unenrollAll(campaignId),
                    (r) => `Unenrolled ${r.removed} patient${r.removed === 1 ? "" : "s"}`
                  );
                }}
              >
                Unenroll all
              </Button>
            </div>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
