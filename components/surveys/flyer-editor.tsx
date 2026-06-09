"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  saveFlyerConfig,
  uploadFlyerBackground,
  generateAiBackground,
} from "@/actions/flyers";
import type { FlyerConfig } from "@/lib/types";
import { Download, Save, Sparkles, Upload } from "lucide-react";

export function FlyerEditor({
  campaignId,
  initialConfig,
  aiEnabled,
}: {
  campaignId: string;
  initialConfig: FlyerConfig;
  aiEnabled: boolean;
}) {
  const [config, setConfig] = useState<FlyerConfig>(initialConfig);
  const [busy, setBusy] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(true);

  // Keep the latest config available to the debounced effect without making
  // it a dependency (we drive the effect off the serialized key instead).
  const configRef = useRef(config);
  configRef.current = config;
  const configKey = JSON.stringify(config);

  function set<K extends keyof FlyerConfig>(key: K, value: FlyerConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  // Live preview: debounce, then render the CURRENT (unsaved) config to a PDF
  // blob and show it. No DB write happens here.
  useEffect(() => {
    let cancelled = false;
    setPreviewing(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/flyer/${campaignId}?preview=1`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(configRef.current),
        });
        if (cancelled || !res.ok) return;
        const blob = await res.blob();
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        setPreviewUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return url;
        });
      } catch {
        // ignore transient errors while typing
      } finally {
        if (!cancelled) setPreviewing(false);
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [campaignId, configKey]);

  // Revoke the last blob URL on unmount.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUpload(file: File) {
    setBusy("upload");
    const fd = new FormData();
    fd.append("background", file);
    const res = await uploadFlyerBackground(fd);
    setBusy(null);
    if (res.error || !res.url) {
      toast.error(typeof res.error === "string" ? res.error : "Upload failed");
      return;
    }
    // Set state only — the live preview updates; Save persists.
    setConfig((c) => ({ ...c, backgroundMode: "image", backgroundUrl: res.url! }));
    toast.success("Background added to preview — Save to keep it");
  }

  async function handleAi() {
    if (!aiPrompt.trim()) {
      toast.error("Describe the look you want");
      return;
    }
    setBusy("ai");
    const res = await generateAiBackground({ campaign_id: campaignId, prompt: aiPrompt });
    setBusy(null);
    if (res.error || !res.url) {
      toast.error(typeof res.error === "string" ? res.error : "Generation failed");
      return;
    }
    setConfig((c) => ({ ...c, backgroundMode: "image", backgroundUrl: res.url! }));
    toast.success("AI background added to preview — Save to keep it");
  }

  async function save() {
    setBusy("save");
    const res = await saveFlyerConfig(campaignId, config);
    setBusy(null);
    if (res.error) {
      toast.error(typeof res.error === "string" ? res.error : "Could not save");
      return;
    }
    toast.success("Flyer saved");
  }

  async function generate() {
    setBusy("gen");
    try {
      const res = await fetch(`/api/flyer/${campaignId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        toast.error("Could not generate flyers");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `flyers-${campaignId.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Editor */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="fl-heading">Heading</Label>
          <Input
            id="fl-heading"
            value={config.heading}
            onChange={(e) => set("heading", e.target.value)}
            placeholder="A Personal Note"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fl-body">Note body</Label>
          <Textarea
            id="fl-body"
            rows={5}
            value={config.body}
            onChange={(e) => set("body", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fl-sig">Signature</Label>
          <Textarea
            id="fl-sig"
            rows={2}
            value={config.signature}
            onChange={(e) => set("signature", e.target.value)}
            placeholder={"With gratitude,\nDr. Shakally"}
          />
        </div>

        <div className="flex items-center gap-4">
          <div className="space-y-2">
            <Label htmlFor="fl-accent">Accent color</Label>
            <input
              id="fl-accent"
              type="color"
              value={config.accentColor}
              onChange={(e) => set("accentColor", e.target.value)}
              className="h-9 w-16 cursor-pointer rounded border bg-background"
            />
          </div>
          <label className="mt-6 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.includeQuestions}
              onChange={(e) => set("includeQuestions", e.target.checked)}
            />
            Print the survey questions on the flyer
          </label>
        </div>

        {/* Background */}
        <div className="space-y-2 rounded-lg border p-3">
          <Label>Background</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={config.backgroundMode === "solid" ? "default" : "outline"}
              size="sm"
              onClick={() => set("backgroundMode", "solid")}
            >
              Solid (accent tint)
            </Button>
            <Button
              type="button"
              variant={config.backgroundMode === "image" ? "default" : "outline"}
              size="sm"
              onClick={() => set("backgroundMode", "image")}
              disabled={!config.backgroundUrl}
            >
              Image
            </Button>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 text-sm hover:bg-muted">
              <Upload className="h-4 w-4" />
              {busy === "upload" ? "Uploading…" : "Upload"}
              <input
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                }}
              />
            </label>
          </div>

          {config.backgroundUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={config.backgroundUrl}
              alt="Flyer background"
              className="h-24 w-auto rounded border object-cover"
            />
          )}

          {aiEnabled && (
            <div className="space-y-2 border-t pt-2">
              <Label htmlFor="fl-ai" className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> Generate with AI (optional)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="fl-ai"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="e.g. soft watercolor leaves, warm and calming"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAi}
                  disabled={busy !== null}
                >
                  {busy === "ai" ? "Generating…" : "Generate"}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={save} disabled={busy !== null}>
            <Save className="mr-1.5 h-4 w-4" />
            {busy === "save" ? "Saving…" : "Save"}
          </Button>
          <Button variant="outline" onClick={generate} disabled={busy !== null}>
            <Download className="mr-1.5 h-4 w-4" />
            {busy === "gen" ? "Generating…" : "Generate flyers (PDF)"}
          </Button>
        </div>
      </div>

      {/* Live preview */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Live preview (sample patient)</Label>
          {previewing && (
            <span className="text-xs text-muted-foreground">Updating…</span>
          )}
        </div>
        {previewUrl ? (
          <iframe
            src={previewUrl}
            className="h-[640px] w-full rounded-lg border bg-muted"
            title="Flyer preview"
          />
        ) : (
          <div className="flex h-[640px] w-full items-center justify-center rounded-lg border bg-muted text-sm text-muted-foreground">
            Rendering preview…
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Updates as you edit — nothing is saved until you click{" "}
          <span className="font-medium">Save</span>. Real flyers use each
          patient&apos;s name and unique QR code.
        </p>
      </div>
    </div>
  );
}
