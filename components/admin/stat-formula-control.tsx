"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateStatFormula } from "@/actions/admin";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Stat, WeeklyFormula } from "@/lib/types";

const LABELS: Record<WeeklyFormula, string> = {
  sum: "Daily total",
  average: "Daily average",
  manual: "Manual weekly",
  collections_per_staff: "Collections / staff",
};

export function StatFormulaControl({ stat, stats }: { stat: Stat; stats: Stat[] }) {
  const [formula, setFormula] = useState<WeeklyFormula>(stat.weekly_formula ?? "sum");
  const [sourceId, setSourceId] = useState(stat.formula_source_stat_id ?? "");
  const [isPending, startTransition] = useTransition();

  function save(nextFormula: WeeklyFormula, nextSource = sourceId) {
    const fallbackSource =
      nextSource || stats.find((candidate) => candidate.name.toLowerCase() === "collections")?.id || "";
    setFormula(nextFormula);
    if (fallbackSource) setSourceId(fallbackSource);
    startTransition(async () => {
      const result = await updateStatFormula(stat.id, {
        weekly_formula: nextFormula,
        formula_source_stat_id: nextFormula === "collections_per_staff" ? fallbackSource : null,
      });
      if (result.error) toast.error(result.error);
      else toast.success("Formula updated");
    });
  }

  return (
    <div className="min-w-44 space-y-1.5">
      <Select value={formula} onValueChange={(value) => value && save(value as WeeklyFormula)} disabled={isPending}>
        <SelectTrigger className="w-full">
          <SelectValue>{(value) => LABELS[value as WeeklyFormula] ?? "Choose formula"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {Object.entries(LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>{label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {formula === "collections_per_staff" && (
        <Select
          value={sourceId}
          onValueChange={(value) => {
            if (!value) return;
            setSourceId(value);
            save(formula, value);
          }}
          disabled={isPending}
        >
          <SelectTrigger className="w-full">
            <SelectValue>{(value) => stats.find((candidate) => candidate.id === value)?.name ?? "Source stat"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {stats.filter((candidate) => candidate.id !== stat.id).map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>{candidate.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
