"use client";

import { useState } from "react";
import { toast } from "sonner";
import { LifeBuoy, Upload } from "lucide-react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { parseCsvRows } from "@/lib/survey/csv";
import { recoverSentRecipients } from "@/actions/surveys";

// ============================================================
// Recover already-mailed flyers (one-time, after the de-id cutover)
//
// The practice uploads their OLD merge file. We parse it IN THE BROWSER and
// pull out ONLY the survey codes (from a `code`/`survey_url` column, or any
// /survey/<code> link). Names and everything else are ignored and never sent.
// Just the opaque codes go to the server, which recreates the recipient rows
// so the physical QR codes resolve again.
// ============================================================

// A survey link anywhere in a cell: ".../survey/<code>".
const URL_RE = /survey\/([0-9a-z]{6,20})/i;
// A bare survey code (Crockford base32, ~10 chars). Used only to detect a
// column that is *overwhelmingly* codes, so we never grab a name column.
const CODEISH = /^[0-9a-z]{8,14}$/;

/**
 * Pull survey codes out of a merge CSV, header-agnostic. First scans every
 * cell for /survey/<code> links; if none exist, finds the one column that is
 * dominantly bare codes. Names/contact columns are never matched.
 */
function extractCodes(text: string): string[] {
  const rows = parseCsvRows(text);
  const out = new Set<string>();

  // Pass 1 — any cell containing a survey link.
  for (const row of rows) {
    for (const cell of row) {
      const m = String(cell).match(URL_RE);
      if (m) out.add(m[1].toLowerCase());
    }
  }
  if (out.size > 0) return [...out];

  // Pass 2 — no links found: locate a column that is mostly bare codes.
  const body = rows.length > 1 ? rows.slice(1) : rows;
  const colCount = rows.reduce((max, r) => Math.max(max, r.length), 0);
  for (let c = 0; c < colCount; c++) {
    const vals = body
      .map((r) => (r[c] ?? "").trim().toLowerCase())
      .filter(Boolean);
    if (vals.length < 2) continue;
    const hits = vals.filter((v) => CODEISH.test(v));
    if (hits.length >= vals.length * 0.7) {
      hits.forEach((v) => out.add(v));
    }
  }
  return [...out];
}

export function RecoverFlyersDialog({ campaignId }: { campaignId: string }) {
  const [open, setOpen] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    const found = extractCodes(await file.text());
    setCodes(found);
    if (found.length === 0) {
      toast.error("No survey codes found — make sure the file has the survey links or a code column.");
    }
  }

  async function recover() {
    if (!codes || codes.length === 0) return;
    setBusy(true);
    try {
      const res = await recoverSentRecipients(campaignId, codes);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `Recovered ${res.recovered} flyer${res.recovered === 1 ? "" : "s"}` +
          (res.skipped ? ` · ${res.skipped} already active` : "")
      );
      setOpen(false);
      setCodes(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border bg-background px-2.5 text-sm font-medium hover:bg-muted transition-colors"
      >
        <LifeBuoy className="h-4 w-4" />
        Recover mailed flyers
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Recover already-mailed flyers</DialogTitle>
          <DialogDescription>
            If flyers went out before their recipient records were cleared, this
            brings their QR codes back to life. Upload the merge file you used to
            print them — only the survey codes are read,{" "}
            <strong>entirely in your browser</strong>. Names are ignored and
            never sent to us.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="recover-file">Original merge file (.csv)</Label>
          <input
            id="recover-file"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted"
          />
          <p className="text-xs text-muted-foreground">
            Export from Numbers/Excel as CSV first. Needs the survey links or a
            “code” column.
          </p>
        </div>

        {codes !== null && (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            Found <span className="font-semibold">{codes.length}</span> survey
            code{codes.length === 1 ? "" : "s"} (names ignored).
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button
            onClick={recover}
            disabled={busy || !codes || codes.length === 0}
          >
            <Upload className="mr-1.5 h-4 w-4" />
            {busy
              ? "Recovering…"
              : `Recover ${codes?.length ?? 0} flyer${codes?.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
