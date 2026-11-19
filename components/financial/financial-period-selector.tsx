import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Option<K extends string> = { key: K; label: string };

export function FinancialPeriodSelector<K extends string>({ months, presets, value, onChange, disabled = false }: {
  months: Option<K>[];
  presets: Option<K>[];
  value: K;
  onChange: (key: K) => void;
  disabled?: boolean;
}) {
  const index = months.findIndex(month => month.key === value);
  const options = months[1] ? [{ ...months[1], label: "Last month" }, ...presets] : presets;
  const arrow = "flex size-9 shrink-0 items-center justify-center rounded-md border hover:bg-accent disabled:opacity-30";
  return <div className="flex max-w-full flex-wrap items-center gap-2">
    <div className="flex items-center gap-1">
      <button type="button" aria-label="Previous month" title="Previous month" className={arrow} disabled={disabled || index < 0 || index + 1 >= months.length} onClick={() => onChange(months[index + 1].key)}><ChevronLeft size={16} /></button>
      <label className="relative">
        <CalendarDays className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
        <select aria-label="Report month" disabled={disabled} value={index < 0 ? "" : value} onChange={e => onChange(e.target.value as K)} className={cn("h-9 appearance-none rounded-md border bg-background pl-9 pr-8 text-sm font-medium", index < 0 && "text-muted-foreground")}>
          {index < 0 && <option value="" disabled>Select month</option>}
          {months.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-2.5 size-4 text-muted-foreground" />
      </label>
      <button type="button" aria-label="Next month" title="Next month" className={arrow} disabled={disabled || index <= 0} onClick={() => onChange(months[index - 1].key)}><ChevronRight size={16} /></button>
    </div>
    <div role="group" aria-label="Reporting period" className="flex max-w-full flex-wrap rounded-lg border bg-muted/35 p-0.5">
      {options.map(o => <button type="button" key={o.key} disabled={disabled} aria-pressed={value === o.key} onClick={() => onChange(o.key)} className={cn("h-8 flex-auto whitespace-nowrap rounded-md px-3 text-sm font-medium text-muted-foreground hover:text-foreground", value === o.key && "bg-background text-foreground shadow-sm")}>{o.label}</button>)}
    </div>
  </div>;
}
