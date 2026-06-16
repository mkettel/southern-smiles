"use client";

import { useMemo, useState } from "react";
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
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { aggregatePatients } from "@/lib/survey/patient-import";
import { computeBridgeKey } from "@/lib/survey/bridge";
import { importDeidentifiedPatients } from "@/actions/surveys";
import { getPatientSalt } from "@/actions/patient-identity";
import type { DeidentifiedPatient } from "@/lib/types";
import { Upload } from "lucide-react";

const ROLE_LABEL: Record<string, string> = {
  name: "name",
  currency: "money",
  date: "date",
  email: "email",
  phone: "phone",
  external_ref: "id",
  other: "other",
};

export function ImportPatientsDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");

  const result = useMemo(
    () => (text.trim() ? aggregatePatients(text) : null),
    [text]
  );

  async function handleFile(file: File) {
    setText(await file.text());
  }

  async function handleImport() {
    if (!result || result.patients.length === 0) {
      toast.error("No patients detected. Make sure there's a name column.");
      return;
    }
    setLoading(true);

    // De-identify in the browser: hash each patient's identity into an opaque
    // bridge_key and drop every name/phone/email BEFORE anything is sent. The
    // server only ever receives the de-identified records below.
    const saltRes = await getPatientSalt();
    if ("error" in saltRes) {
      setLoading(false);
      toast.error(saltRes.error);
      return;
    }
    const salt = saltRes.salt;

    const records: DeidentifiedPatient[] = await Promise.all(
      result.patients.map(async (p) => ({
        bridge_key: await computeBridgeKey({
          externalRef: p.external_ref,
          nameKey: p.name_key,
          salt,
        }),
        external_ref: p.external_ref,
        total_collected_cents: p.total_collected_cents,
        visit_count: p.visit_count,
        first_seen: p.first_seen,
        last_seen: p.last_seen,
      }))
    );

    const res = await importDeidentifiedPatients({ records });
    setLoading(false);

    if (!("inserted" in res)) {
      toast.error(typeof res.error === "string" ? res.error : "Import failed");
      return;
    }
    toast.success(
      `Imported ${res.inserted} new` +
        (res.updated ? ` · updated ${res.updated}` : "") +
        " patients"
    );
    setText("");
    setOpen(false);
  }

  const top = useMemo(() => {
    if (!result) return [];
    return [...result.patients]
      .sort((a, b) => b.total_collected_cents - a.total_collected_cents)
      .slice(0, 4);
  }, [result]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
      >
        <Upload className="h-4 w-4" />
        Import Patients
      </DialogTrigger>
      <DialogPortal>
        <DialogOverlay />
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import patients</DialogTitle>
            <DialogDescription>
              Upload or paste any patient CSV — a contact list or a revenue
              report. We detect the columns, skip title/total rows, and
              aggregate revenue, visit count, and last-visit date per patient.
              Names never leave your browser — only anonymized keys and metrics
              are saved. <strong>Keep this CSV file</strong> — you&apos;ll need
              it to address survey letters at mail-merge time.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="csv-file">Upload a .csv file</Label>
              <input
                id="csv-file"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
                className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="csv-text">…or paste CSV content</Label>
              <Textarea
                id="csv-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                placeholder={"Patient,Applied Date,Total Collection\n\"Smith, Jane\",05/31/2024,-$300.00"}
                className="font-mono text-xs"
              />
            </div>

            {result && (
              <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                <p className="text-sm">
                  <span className="font-semibold">
                    {result.patients.length}
                  </span>{" "}
                  patient{result.patients.length === 1 ? "" : "s"} detected
                  {result.skipped > 0 && (
                    <span className="text-muted-foreground">
                      {" "}
                      · {result.skipped} non-patient row
                      {result.skipped === 1 ? "" : "s"} skipped
                    </span>
                  )}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {result.detected.map((d) => (
                    <Badge
                      key={d.header}
                      className="bg-background text-foreground"
                    >
                      {d.header}
                      <span className="ml-1 text-muted-foreground">
                        {ROLE_LABEL[d.role]}
                      </span>
                    </Badge>
                  ))}
                </div>
                {top.length > 0 && top[0].total_collected_cents > 0 && (
                  <div className="space-y-0.5 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">
                      Top patients by collections:
                    </p>
                    {top.map((p) => (
                      <p key={p.name_key}>
                        ${(p.total_collected_cents / 100).toLocaleString()} ·{" "}
                        {p.visit_count} visit{p.visit_count === 1 ? "" : "s"} ·{" "}
                        {p.full_name}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <DialogClose className="inline-flex items-center rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">
              Cancel
            </DialogClose>
            <Button
              onClick={handleImport}
              disabled={loading || !result || result.patients.length === 0}
            >
              {loading
                ? "Importing…"
                : `Import ${result ? result.patients.length : ""}`.trim()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
