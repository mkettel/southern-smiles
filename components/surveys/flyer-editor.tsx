"use client";

import { useState } from "react";
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
import { Download, Save, Sparkles, Upload, RefreshCw } from "lucide-react";

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
  const [nonce, setNonce] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");

  function set<K extends keyof FlyerConfig>(key: K, value: FlyerConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  async function persist(next: FlyerConfig, msg = "Flyer saved") {
    setBusy("save");
    const res = await saveFlyerConfig(campaignId, next);
    setBusy(null);
    if (res.error) {
      toast.error(typeof res.error === "string" ? res.error : "Could not save");
      return false;
    }
    toast.success(msg);
    setNonce((n) => n + 1); // refresh preview
    return true;
  }

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
    const next = { ...config, backgroundMode: "image" as const, backgroundUrl: res.url };
    setConfig(next);
    await persist(next, "Background uploaded");
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
    const next = { ...config, backgroundMode: "image" as const, backgroundUrl: res.url };
    setConfig(next);
    await persist(next, "AI background generated");
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
                accept="image/png,image/jpeg,image/webp"
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
          <Button onClick={() => persist(config)} disabled={busy !== null}>
            <Save className="mr-1.5 h-4 w-4" />
            {busy === "save" ? "Saving…" : "Save"}
          </Button>
          <a
            href={`/api/flyer/${campaignId}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-colors"
          >
            <Download className="h-4 w-4" />
            Generate flyers (PDF)
          </a>
        </div>
      </div>

      {/* Preview */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Preview (sample patient)</Label>
          <button
            type="button"
            onClick={() => setNonce((n) => n + 1)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </button>
        </div>
        <iframe
          key={nonce}
          src={`/api/flyer/${campaignId}?preview=1&t=${nonce}`}
          className="h-[640px] w-full rounded-lg border bg-muted"
          title="Flyer preview"
        />
        <p className="text-xs text-muted-foreground">
          Save to update the preview. The real flyers use each patient&apos;s name
          and unique QR code.
        </p>
      </div>
    </div>
  );
}
