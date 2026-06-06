"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Copy, Download, FileText, Loader2, Table } from "lucide-react";
import { getStatsExport, type ExportPreset, type StatsExport } from "@/actions/export";
import { toMarkdown, toCsv } from "@/lib/export-format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PRESETS: { value: ExportPreset; label: string }[] = [
  { value: "last_week", label: "Last week" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

type Format = "markdown" | "csv";

export function ExportTool() {
  const [preset, setPreset] = useState<ExportPreset>("30d");
  const [format, setFormat] = useState<Format>("markdown");
  const [data, setData] = useState<StatsExport | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      try {
        setData(await getStatsExport(preset));
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to build export",
        );
      }
    });
  }, [preset]);

  const markdown = useMemo(() => (data ? toMarkdown(data) : ""), [data]);
  const csv = useMemo(() => (data ? toCsv(data) : ""), [data]);
  const content = format === "markdown" ? markdown : csv;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success(
        format === "markdown"
          ? "Copied — paste into Claude or ChatGPT"
          : "CSV copied to clipboard",
      );
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  }

  function handleDownload() {
    if (!data) return;
    const ext = format === "markdown" ? "md" : "csv";
    const mime = format === "markdown" ? "text/markdown" : "text/csv";
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `southern-smiles-stats-${preset}-${data.range.end}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      {/* Range presets */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Date range</label>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button
              key={p.value}
              variant={preset === p.value ? "default" : "outline"}
              size="sm"
              onClick={() => setPreset(p.value)}
            >
              {p.label}
            </Button>
          ))}
        </div>
        {data && (
          <p className="text-xs text-muted-foreground">
            {data.range.start} → {data.range.end} · {data.range.weekCount} week
            {data.range.weekCount === 1 ? "" : "s"} · {data.stats.length} stats
          </p>
        )}
      </div>

      {/* Format toggle */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Format</label>
        <div className="flex gap-2">
          <Button
            variant={format === "markdown" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setFormat("markdown")}
          >
            <FileText className="h-3.5 w-3.5" />
            Markdown (for AI)
          </Button>
          <Button
            variant={format === "csv" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setFormat("csv")}
          >
            <Table className="h-3.5 w-3.5" />
            CSV
          </Button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={handleCopy} disabled={!data || isPending}>
          {copied ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
          {format === "markdown" ? "Copy for AI" : "Copy CSV"}
        </Button>
        <Button variant="outline" onClick={handleDownload} disabled={!data || isPending}>
          <Download className="h-4 w-4" />
          Download .{format === "markdown" ? "md" : "csv"}
        </Button>
      </div>

      {/* Preview */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Preview</label>
        <div className="relative rounded-lg border bg-muted/30">
          {isPending && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/60">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          <pre
            className={cn(
              "max-h-[480px] overflow-auto p-4 text-xs leading-relaxed whitespace-pre-wrap break-words",
              "font-mono text-foreground/90",
            )}
          >
            {content || "No data to preview."}
          </pre>
        </div>
      </div>
    </div>
  );
}
