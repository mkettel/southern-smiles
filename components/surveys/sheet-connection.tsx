"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getSheetTabs,
  saveSheetSource,
  syncSheetNow,
} from "@/actions/patient-sources";
import type { PatientSheetSource } from "@/lib/types";
import { Sheet, RefreshCw, CheckCircle2, AlertCircle, Link2 } from "lucide-react";

export function SheetConnection({
  source,
  googleConfigured,
}: {
  source: PatientSheetSource | null;
  googleConfigured: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(!source);
  const [url, setUrl] = useState(source?.spreadsheet_url ?? "");
  const [tabs, setTabs] = useState<string[] | null>(null);
  const [tab, setTab] = useState(source?.sheet_title ?? "");
  const [busy, setBusy] = useState<string | null>(null);

  if (!googleConfigured) {
    return (
      <Card>
        <CardContent className="flex items-start gap-3 py-4 text-sm">
          <Sheet className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-medium">Google Sheets sync isn’t set up yet</p>
            <p className="text-muted-foreground">
              Add a Google service account (Sheets API) on the server, then
              connect your patient sheet here to sync with one click.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  async function loadTabs() {
    if (!url.trim()) return;
    setBusy("tabs");
    const res = await getSheetTabs(url);
    setBusy(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setTabs(res.tabs ?? []);
    if (res.tabs && res.tabs.length && !tab) setTab(res.tabs[0]);
  }

  async function save() {
    setBusy("save");
    const res = await saveSheetSource({ url, sheetTitle: tab || null });
    setBusy(null);
    if (res.error) {
      toast.error(typeof res.error === "string" ? res.error : "Could not connect");
      return;
    }
    toast.success("Sheet connected");
    setEditing(false);
    router.refresh();
  }

  async function sync() {
    setBusy("sync");
    const res = await syncSheetNow();
    setBusy(null);
    if (!("rowCount" in res)) {
      toast.error(typeof res.error === "string" ? res.error : "Sync failed");
      return;
    }
    toast.success(
      `Synced ${res.rowCount} patients — ${res.inserted} new, ${res.updated} updated`
    );
    router.refresh();
  }

  // ---- Connected (view) state ----
  if (source && !editing) {
    const status = source.last_status;
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
          <Sheet className="h-5 w-5 text-green-600 dark:text-green-500" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              Google Sheet connected
              {source.sheet_title ? ` · ${source.sheet_title}` : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              {source.last_synced_at ? (
                <>
                  Data as of{" "}
                  {new Date(source.last_synced_at).toLocaleString()} ·{" "}
                  {source.last_row_count ?? 0} patients
                </>
              ) : (
                "Not synced yet"
              )}
            </p>
            {status === "error" && source.last_error && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="h-3 w-3" />
                {source.last_error}
              </p>
            )}
            {status === "ok" && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-green-600 dark:text-green-500">
                <CheckCircle2 className="h-3 w-3" />
                Last sync OK
              </p>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {source.spreadsheet_url && (
              <a
                href={source.spreadsheet_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <Link2 className="h-4 w-4" />
                Open
              </a>
            )}
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              Change
            </Button>
            <Button size="sm" onClick={sync} disabled={busy !== null}>
              <RefreshCw
                className={`mr-1.5 h-4 w-4 ${busy === "sync" ? "animate-spin" : ""}`}
              />
              {busy === "sync" ? "Syncing…" : "Sync now"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ---- Connect / edit state ----
  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sheet className="h-5 w-5 text-muted-foreground" />
          Connect a Google Sheet
        </div>
        <p className="text-xs text-muted-foreground">
          Share your patient sheet (Viewer) with the app’s service account, then
          paste its link. We’ll read it and aggregate per patient.
        </p>
        <div className="space-y-2">
          <Label htmlFor="sheet-url">Google Sheets link</Label>
          <div className="flex gap-2">
            <Input
              id="sheet-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/…"
            />
            <Button
              variant="outline"
              onClick={loadTabs}
              disabled={busy !== null || !url.trim()}
            >
              {busy === "tabs" ? "…" : "Load tabs"}
            </Button>
          </div>
        </div>
        {tabs && (
          <div className="space-y-2">
            <Label htmlFor="sheet-tab">Tab</Label>
            <select
              id="sheet-tab"
              value={tab}
              onChange={(e) => setTab(e.target.value)}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            >
              {tabs.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button onClick={save} disabled={busy !== null || !url.trim()}>
            {busy === "save" ? "Connecting…" : "Connect"}
          </Button>
          {source && (
            <Button
              variant="outline"
              onClick={() => setEditing(false)}
              disabled={busy !== null}
            >
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
