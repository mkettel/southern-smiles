"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { parseCsvRows } from "@/lib/survey/csv";
import { detectColumns, parseLastFirst } from "@/lib/survey/patient-import";
import { computeBridgeKey } from "@/lib/survey/bridge";
import { getPatientSalt } from "@/actions/patient-identity";
import { getCampaignMergeData } from "@/actions/surveys";
import { FlyerPageView } from "@/components/flyer/flyer-page-view";
import {
  fontsInDocument,
  googleFontsUrl,
  type FlyerDocument,
  type FlyerRenderData,
} from "@/lib/flyer/types";
import { Printer, Upload } from "lucide-react";

// ============================================================
// Mail merge (de-identified, client-side)
//
// The practice uploads their OWN name+address list. We never send it anywhere:
// the file is parsed in the browser, each row is hashed to a bridge_key with
// the per-practice salt, and joined LOCALLY against the survey codes the server
// returns (which carry no names). Matched rows are rendered to addressed
// letters with the SAME FlyerPageView the editor/print pipeline uses, and
// printed via the browser's print dialog (→ Save as PDF). No identity ever
// touches the server.
// ============================================================

type Summary = { matched: number; unmatched: number; total: number };

export function MailMerge({
  campaignId,
  doc,
  practiceName,
  creditLabel,
}: {
  campaignId: string;
  doc: FlyerDocument;
  practiceName: string;
  creditLabel: string;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [pages, setPages] = useState<FlyerRenderData[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);

  const fontsHref = useMemo(() => googleFontsUrl(fontsInDocument(doc)), [doc]);

  async function handleFile(file: File) {
    setText(await file.text());
    setPages([]);
    setSummary(null);
  }

  async function generate() {
    if (!text.trim()) {
      toast.error("Upload your patient name + address CSV first.");
      return;
    }
    setBusy(true);
    try {
      const rows = parseCsvRows(text);
      if (rows.length < 2) {
        toast.error("That CSV looks empty.");
        return;
      }
      // Assume row 0 is the header (mailing lists are typically clean).
      const headers = rows[0];
      const dataRows = rows.slice(1).filter((r) => r.length === headers.length);
      const detected = detectColumns(headers, dataRows);
      const nameIdx = detected.findIndex((d) => d.role === "name");
      const refIdx = detected.findIndex((d) => d.role === "external_ref");
      if (nameIdx === -1) {
        toast.error("No name column detected in that CSV.");
        return;
      }

      const [saltRes, merge] = await Promise.all([
        getPatientSalt(),
        getCampaignMergeData(campaignId),
      ]);
      if ("error" in saltRes) {
        toast.error(saltRes.error);
        return;
      }
      const salt = saltRes.salt;

      // Index the server's de-identified recipients for the local join.
      const byRef = new Map<string, string>();
      const byKey = new Map<string, string>();
      for (const m of merge) {
        if (m.external_ref) byRef.set(m.external_ref.trim(), m.code);
        if (m.bridge_key) byKey.set(m.bridge_key, m.code);
      }

      const origin = window.location.origin;
      const matched: FlyerRenderData[] = [];
      let unmatched = 0;

      for (const row of dataRows) {
        const rawName = (row[nameIdx] ?? "").trim();
        if (!rawName) continue;
        const { full_name, first_name, name_key } = parseLastFirst(rawName);
        const externalRef = refIdx >= 0 ? (row[refIdx] ?? "").trim() : "";
        const bridgeKey = await computeBridgeKey({
          externalRef,
          nameKey: name_key,
          salt,
        });
        const code =
          (externalRef && byRef.get(externalRef)) || byKey.get(bridgeKey);
        if (!code) {
          unmatched++;
          continue;
        }
        const fullUrl = `${origin}/survey/${code}`;
        matched.push({
          firstName: first_name || full_name || "there",
          fullName: full_name,
          practiceName,
          creditLabel,
          surveyUrl: fullUrl.replace(/^https?:\/\//, ""),
          qrDataUrl: await QRCode.toDataURL(fullUrl, {
            margin: 1,
            width: 600,
            errorCorrectionLevel: "M",
          }),
        });
      }

      setPages(matched);
      setSummary({
        matched: matched.length,
        unmatched,
        total: dataRows.length,
      });
      if (matched.length === 0) {
        toast.error(
          "No rows matched the enrolled recipients. Check the name format, or include a patient/chart id column."
        );
      } else {
        toast.success(
          `Matched ${matched.length} letter${matched.length === 1 ? "" : "s"}` +
            (unmatched ? ` · ${unmatched} unmatched` : "")
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Upload your practice&apos;s patient name + address list. It is matched to
        survey codes <strong>entirely in your browser</strong> — names never
        leave this device. Then print the addressed letters (use your print
        dialog&apos;s “Save as PDF” for a file to send to your mail house).
      </p>

      <div className="space-y-2">
        <Label htmlFor="merge-file">Patient list (.csv)</Label>
        <input
          id="merge-file"
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
          className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted"
        />
        <p className="text-xs text-muted-foreground">
          Needs a name column. Include a patient/chart id column for the most
          reliable matching.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={generate} disabled={busy || !text.trim()}>
          <Upload className="mr-1.5 h-4 w-4" />
          {busy ? "Matching…" : "Match & build letters"}
        </Button>
        {pages.length > 0 && (
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" />
            Print {pages.length} letter{pages.length === 1 ? "" : "s"}
          </Button>
        )}
      </div>

      {summary && (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <span className="font-semibold">{summary.matched}</span> of{" "}
          {summary.total} row{summary.total === 1 ? "" : "s"} matched an enrolled
          recipient
          {summary.unmatched > 0 && (
            <span className="text-muted-foreground">
              {" "}
              · {summary.unmatched} unmatched (name format differs, or not
              enrolled)
            </span>
          )}
          .
        </div>
      )}

      {/* Hidden print area — rendered with the same component as the editor, so
          the printed letter is pixel-faithful. Visible only when printing. */}
      {pages.length > 0 && (
        <>
          {/* eslint-disable-next-line @next/next/no-page-custom-font */}
          <link rel="stylesheet" href={fontsHref} />
          <style>{`
            #flyer-print-root { display: none; }
            @media print {
              body { visibility: hidden; }
              #flyer-print-root { display: block; visibility: visible; position: absolute; left: 0; top: 0; }
              #flyer-print-root * { visibility: visible; }
              .flyer-page { break-after: page; page-break-after: always; }
              .flyer-page:last-child { break-after: auto; page-break-after: auto; }
              @page { size: letter; margin: 0; }
            }
          `}</style>
          <div id="flyer-print-root">
            {pages.map((data, i) => (
              <FlyerPageView
                key={i}
                doc={doc}
                data={data}
                className="flyer-page"
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
