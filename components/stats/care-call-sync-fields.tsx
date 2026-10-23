"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { saveCareCallAdjustment } from "@/actions/care-call-sync";
import type { WorkspaceStat } from "@/actions/stats-workspace";
import { phoenixDay } from "@/lib/care-call-sync";
import { buildStatsHref } from "@/lib/stats-navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CareCallSyncFields({
  item,
  mode,
  dates,
  weekStart,
}: {
  item: WorkspaceStat;
  mode: "daily" | "weekly";
  dates: string[];
  weekStart: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const rows = item.careSyncDays ?? [];
  const today = phoenixDay();
  const automatic = rows.reduce((n, r) => n + (r.vault_count ?? 0), 0);
  const additional = rows.reduce((n, r) => n + r.additional_count, 0);
  const hasSync = rows.some((r) => r.vault_count !== null);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${weekStart}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
  const incomplete = weekDays.filter(
    (d) =>
      d < today &&
      !rows.some((r) => r.entry_date === d && r.vault_count !== null),
  );
  const lastSync = rows
    .map((r) => r.synced_at)
    .filter((v): v is string => !!v)
    .sort()
    .at(-1);
  function save(
    input: Parameters<typeof saveCareCallAdjustment>[0],
    done?: () => void,
  ) {
    start(async () => {
      try {
        const result = await saveCareCallAdjustment(input);
        if (result.error) toast.error(result.error);
        else {
          toast.success("Care Calls saved");
          done?.();
          router.refresh();
        }
      } catch {
        toast.error("Could not save. Please retry.");
      }
    });
  }
  if (mode === "daily")
    return (
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-5">
          {dates.map((date) => {
            const row = rows.find((r) => r.entry_date === date);
            const draft = drafts[date] ?? String(row?.additional_count ?? 0);
            return (
              <div className="space-y-2" key={date}>
                <p className="text-xs font-medium">
                  {new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    timeZone: "UTC",
                  })}
                </p>
                <label className="block text-xs text-muted-foreground">
                  From Vault
                  <Input
                    className="mt-1 bg-muted/40"
                    readOnly
                    aria-label={`From Vault ${date}`}
                    value={row?.vault_count ?? "Awaiting sync"}
                  />
                </label>
                <label className="block text-xs text-muted-foreground">
                  Additional calls/texts
                  <Input
                    className="mt-1"
                    type="number"
                    min={0}
                    step={1}
                    value={draft}
                    disabled={pending || date > today}
                    aria-label={`Additional calls ${date}`}
                    onChange={(e) =>
                      setDrafts((old) => ({ ...old, [date]: e.target.value }))
                    }
                  />
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    pending ||
                    date > today ||
                    !draft.trim() ||
                    !Number.isSafeInteger(Number(draft)) ||
                    Number(draft) < 0
                  }
                  onClick={() =>
                    save({
                      operation: "additional",
                      date,
                      value: Number(draft),
                    })
                  }
                >
                  Save
                </Button>
                <p className="text-xs">
                  Saved total:{" "}
                  {row ? (row.vault_count ?? 0) + row.additional_count : "—"}
                  {row?.vault_count == null ? " · partial" : ""}
                </p>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Add only calls/texts not already in Vault. Automatic counts arrive
          after each day ends, Arizona time. Weekend attempts are included in
          the weekly total.
        </p>
      </div>
    );
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-muted-foreground">
            From Vault · automatic
          </p>
          <div className="mt-1 rounded-md border bg-muted/40 px-3 py-2">
            {hasSync ? automatic : "Awaiting sync"}
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">
            Additional calls/texts
          </p>
          <div className="mt-1 rounded-md border bg-muted/40 px-3 py-2">
            {additional}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm">Total reported</span>
        <strong className="text-3xl">{item.weeklyEntry?.value ?? "—"}</strong>
      </div>
      {incomplete.length > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Awaiting Vault totals for {incomplete.length} completed day(s). Total
          may be partial.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Link
          className={buttonVariants({ size: "sm", variant: "outline" })}
          href={buildStatsHref({
            mode: "daily",
            week: weekStart,
            division: item.post.division?.id,
          })}
        >
          Edit daily additions
        </Link>
        <Button
          size="sm"
          variant="outline"
          disabled={pending || weekStart > today}
          onClick={() => {
            setValue(String(item.weeklyEntry?.value ?? ""));
            setReason(item.careOverrideReason ?? "");
            setEditing(true);
          }}
        >
          Override total
        </Button>
      </div>
      {item.weeklyEntry?.is_manual_override && (
        <div className="space-y-2 rounded-md bg-muted/50 p-3 text-sm">
          <p>Calculated total: {item.weeklyEntry.calculated_value ?? "—"}</p>
          <p>Reason: {item.careOverrideReason ?? "Not recorded"}</p>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              save({ operation: "reset", date: weekStart }, () =>
                setEditing(false),
              )
            }
          >
            Use calculated total
          </Button>
        </div>
      )}
      {editing && (
        <form
          className="space-y-3 rounded-md border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            save(
              {
                operation: "override",
                date: weekStart,
                value: Number(value),
                reason,
              },
              () => setEditing(false),
            );
          }}
        >
          <label className="block text-sm">
            Corrected weekly total
            <Input
              className="mt-1"
              required
              type="number"
              min={0}
              step={1}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Reason for override
            <Input
              className="mt-1"
              required
              maxLength={200}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Replaces this week’s reported total. Vault counts and daily
            additions stay unchanged.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={
                pending ||
                !value.trim() ||
                !Number.isSafeInteger(Number(value)) ||
                Number(value) < 0 ||
                !reason.trim()
              }
            >
              Save override
            </Button>
            <Button
              size="sm"
              variant="outline"
              type="button"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      <p className="text-xs text-muted-foreground">
        {lastSync
          ? `Last sync: ${new Date(lastSync).toLocaleString("en-US", { timeZone: "America/Phoenix" })} Arizona time`
          : "Automatic reporting starts October 26, 2026. No earlier numbers are imported."}
      </p>
    </div>
  );
}
