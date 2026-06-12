"use client";

// Property panel for the flyer designer. Shows page-background controls when
// nothing is selected, otherwise the selected block's controls.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { generateAiImage, uploadFlyerImage } from "@/actions/flyers";
import {
  FLYER_FONTS,
  FLYER_SHAPES,
  MERGE_TOKENS,
  type FlyerBackground,
  type FlyerBlock,
  type FlyerDocument,
  type FlyerFontKey,
  type FlyerImageBlock,
} from "@/lib/flyer/types";
import { AlignCenter, AlignLeft, AlignRight, Sparkles, Upload } from "lucide-react";

type PatchBlock = (
  id: string,
  patch: Partial<FlyerBlock>,
  snapshotKey: string | null
) => void;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">{children}</div>
    </div>
  );
}

function NumInput({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  width = "w-16",
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  width?: string;
}) {
  return (
    <Input
      type="number"
      className={`h-7 ${width} px-1.5 text-right text-xs`}
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
      }}
    />
  );
}

function ColorInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="color"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 w-9 cursor-pointer rounded border bg-background p-0.5"
    />
  );
}

function FontSelect({
  value,
  onChange,
}: {
  value: FlyerFontKey;
  onChange: (v: FlyerFontKey) => void;
}) {
  return (
    <select
      className="h-7 w-full rounded-md border bg-background px-1.5 text-xs"
      value={value}
      onChange={(e) => onChange(e.target.value as FlyerFontKey)}
    >
      {Object.entries(FLYER_FONTS).map(([key, f]) => (
        <option key={key} value={key}>
          {f.label}
        </option>
      ))}
    </select>
  );
}

/** Upload an image file and report its pixel size (for print-DPI checks). */
async function uploadAndMeasure(
  file: File
): Promise<{ url: string; naturalWidth: number; naturalHeight: number } | { error: string }> {
  const fd = new FormData();
  fd.append("image", file);
  const res = await uploadFlyerImage(fd);
  if (res.error || !res.url) {
    return { error: typeof res.error === "string" ? res.error : "Upload failed" };
  }
  const dims = await new Promise<{ w: number; h: number }>((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 0, h: 0 });
    img.src = res.url!;
  });
  return { url: res.url, naturalWidth: dims.w, naturalHeight: dims.h };
}

function aspectFor(w: number, h: number): "portrait" | "landscape" | "square" {
  const r = w / h;
  if (r > 1.3) return "landscape";
  if (r < 0.77) return "portrait";
  return "square";
}

/** Effective print resolution of an image stretched to w pt (w/72 inches). */
function effectiveDpi(naturalWidth: number, wPt: number): number {
  return Math.round(naturalWidth / (wPt / 72));
}

/** Animated placeholder shown while AI paints an image. */
export function ImageGenLoading({ compact = false }: { compact?: boolean }) {
  const messages = [
    "Sketching ideas…",
    "Mixing colors…",
    "Painting details…",
    "Almost there…",
  ];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => x + 1), 2600);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      className={`relative w-full overflow-hidden rounded-md border ${compact ? "h-16" : "h-24"}`}
    >
      <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-teal-100 via-rose-100 to-amber-100 dark:from-teal-900/40 dark:via-rose-900/30 dark:to-amber-900/30" />
      <div className="relative flex h-full flex-col items-center justify-center gap-1">
        <span className="relative flex h-6 w-6 items-center justify-center">
          <span className="absolute inset-0 animate-spin rounded-full border-2 border-teal-500/60 border-t-transparent" />
          <Sparkles className="h-3 w-3 animate-pulse text-teal-600" />
        </span>
        <span className="text-[11px] font-medium text-muted-foreground">
          {messages[i % messages.length]}
        </span>
      </div>
    </div>
  );
}

function ImageSourceControls({
  campaignId,
  aiEnabled,
  aspect,
  kind,
  onImage,
  onBusyChange,
}: {
  campaignId: string;
  aiEnabled: boolean;
  aspect: "portrait" | "landscape" | "square";
  kind: "background" | "illustration";
  onImage: (r: { url: string; naturalWidth?: number; naturalHeight?: number }) => void;
  onBusyChange?: (generating: boolean) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");

  async function handleFile(file: File) {
    setBusy("upload");
    const res = await uploadAndMeasure(file);
    setBusy(null);
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    onImage(res);
  }

  async function handleAi() {
    if (!prompt.trim()) {
      toast.error("Describe the image you want");
      return;
    }
    setBusy("ai");
    onBusyChange?.(true);
    try {
      const res = await generateAiImage({
        campaign_id: campaignId,
        prompt,
        kind,
        aspect,
      });
      if (res.error || !res.url) {
        toast.error(typeof res.error === "string" ? res.error : "Generation failed");
        return;
      }
      onImage({
        url: res.url,
        naturalWidth: res.width ?? undefined,
        naturalHeight: res.height ?? undefined,
      });
    } finally {
      setBusy(null);
      onBusyChange?.(false);
    }
  }

  return (
    <div className="space-y-2">
      <label className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border bg-background px-2 py-1.5 text-xs hover:bg-muted">
        <Upload className="h-3.5 w-3.5" />
        {busy === "upload" ? "Uploading…" : "Upload image"}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
      </label>
      {aiEnabled && (
        <div className="space-y-1.5">
          <Input
            className="h-7 text-xs"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. watercolor tooth with flowers"
          />
          {busy === "ai" ? (
            <ImageGenLoading />
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handleAi}
              disabled={busy !== null}
            >
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              Generate with AI
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function FlyerInspector({
  campaignId,
  doc,
  selected,
  aiEnabled,
  patchBlock,
  patchBackground,
  onImageBusy,
}: {
  campaignId: string;
  doc: FlyerDocument;
  selected: FlyerBlock | null;
  aiEnabled: boolean;
  patchBlock: PatchBlock;
  patchBackground: (bg: FlyerBackground, snapshotKey: string | null) => void;
  /** Reports which target ("background" or a block id) is generating art,
   *  so the canvas can show a loading overlay in place. */
  onImageBusy?: (target: string, generating: boolean) => void;
}) {
  return (
    <div className="h-fit space-y-3 rounded-lg border p-3">
      {selected ? (
        <BlockPanel
          campaignId={campaignId}
          block={selected}
          aiEnabled={aiEnabled}
          patchBlock={patchBlock}
          onImageBusy={onImageBusy}
        />
      ) : (
        <>
          <BackgroundPanel
            campaignId={campaignId}
            background={doc.page.background}
            aiEnabled={aiEnabled}
            patchBackground={patchBackground}
            onImageBusy={onImageBusy}
          />
          <p className="border-t pt-2 text-[11px] leading-snug text-muted-foreground">
            Select a block on the canvas to edit it. Drag to move, use the
            handles to resize.
          </p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page background
// ---------------------------------------------------------------------------

export function BackgroundPanel({
  campaignId,
  background,
  aiEnabled,
  patchBackground,
  onImageBusy,
}: {
  campaignId: string;
  background: FlyerBackground;
  aiEnabled: boolean;
  patchBackground: (bg: FlyerBackground, snapshotKey: string | null) => void;
  onImageBusy?: (target: string, generating: boolean) => void;
}) {
  const key = "bg";
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Page background</p>
      <div className="flex gap-1">
        {(["solid", "gradient", "image"] as const).map((t) => (
          <Button
            key={t}
            type="button"
            size="sm"
            variant={background.type === t ? "secondary" : "outline"}
            className="flex-1 capitalize"
            onClick={() => {
              if (background.type === t) return;
              if (t === "solid") patchBackground({ type: "solid", color: "#fdf9f3" }, key);
              else if (t === "gradient")
                patchBackground(
                  { type: "gradient", from: "#fdf2f8", to: "#ccfbf1", angle: 160 },
                  key
                );
              else
                patchBackground(
                  { type: "image", url: null, overlayColor: "#ffffff", overlayOpacity: 0.15 },
                  key
                );
            }}
          >
            {t}
          </Button>
        ))}
      </div>

      {background.type === "solid" && (
        <Row label="Color">
          <ColorInput
            value={background.color}
            onChange={(c) => patchBackground({ ...background, color: c }, key)}
          />
        </Row>
      )}

      {background.type === "gradient" && (
        <>
          <Row label="From">
            <ColorInput
              value={background.from}
              onChange={(c) => patchBackground({ ...background, from: c }, key)}
            />
          </Row>
          <Row label="To">
            <ColorInput
              value={background.to}
              onChange={(c) => patchBackground({ ...background, to: c }, key)}
            />
          </Row>
          <Row label="Angle">
            <NumInput
              value={background.angle}
              min={0}
              max={360}
              onChange={(v) => patchBackground({ ...background, angle: v }, key)}
            />
          </Row>
        </>
      )}

      {background.type === "image" && (
        <>
          {background.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={background.url}
              alt="Background"
              className="h-24 w-full rounded border object-cover"
            />
          )}
          <ImageSourceControls
            campaignId={campaignId}
            aiEnabled={aiEnabled}
            aspect="portrait"
            kind="background"
            onImage={(r) => patchBackground({ ...background, url: r.url }, key)}
            onBusyChange={(g) => onImageBusy?.("background", g)}
          />
          <Row label="Wash color">
            <ColorInput
              value={background.overlayColor}
              onChange={(c) => patchBackground({ ...background, overlayColor: c }, key)}
            />
          </Row>
          <Row label="Wash strength">
            <input
              type="range"
              min={0}
              max={0.9}
              step={0.05}
              value={background.overlayOpacity}
              onChange={(e) =>
                patchBackground(
                  { ...background, overlayOpacity: Number(e.target.value) },
                  key
                )
              }
            />
          </Row>
          <p className="text-[11px] leading-snug text-muted-foreground">
            A light wash keeps text readable on top of busy images.
          </p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Block panels
// ---------------------------------------------------------------------------

function BlockPanel({
  campaignId,
  block,
  aiEnabled,
  patchBlock,
  onImageBusy,
}: {
  campaignId: string;
  block: FlyerBlock;
  aiEnabled: boolean;
  patchBlock: PatchBlock;
  onImageBusy?: (target: string, generating: boolean) => void;
}) {
  const key = `insp-${block.id}`;
  const set = (patch: Partial<FlyerBlock>) => patchBlock(block.id, patch, key);

  const geometry = (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 border-t pt-2">
      <Row label="X">
        <NumInput value={Math.round(block.x)} min={-612} max={1224} onChange={(v) => set({ x: v })} />
      </Row>
      <Row label="Y">
        <NumInput value={Math.round(block.y)} min={-792} max={1584} onChange={(v) => set({ y: v })} />
      </Row>
      <Row label="W">
        <NumInput value={Math.round(block.w)} min={12} max={918} onChange={(v) => set({ w: v })} />
      </Row>
      <Row label="H">
        <NumInput value={Math.round(block.h)} min={12} max={1188} onChange={(v) => set({ h: v })} />
      </Row>
      <Row label="Rotate">
        <NumInput value={block.rotation} min={-180} max={180} onChange={(v) => set({ rotation: v })} />
      </Row>
    </div>
  );

  switch (block.type) {
    case "text":
      return (
        <div className="space-y-2.5">
          <p className="text-sm font-medium">Text</p>
          <Textarea
            id="insp-text"
            rows={4}
            className="text-xs"
            value={block.text}
            onChange={(e) => set({ text: e.target.value })}
          />
          <div className="flex flex-wrap gap-1">
            {MERGE_TOKENS.map((t) => (
              <button
                key={t.token}
                type="button"
                className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted/70"
                onClick={() => set({ text: `${block.text}${t.token}` })}
                title={`Insert ${t.token}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <FontSelect value={block.font} onChange={(font) => set({ font })} />
          <Row label="Size">
            <NumInput value={block.fontSize} min={6} max={120} onChange={(v) => set({ fontSize: v })} />
            <Button
              type="button"
              size="sm"
              variant={block.bold ? "secondary" : "outline"}
              className="h-7 w-7 px-0 font-bold"
              onClick={() => set({ bold: !block.bold })}
            >
              B
            </Button>
          </Row>
          <Row label="Align">
            {(
              [
                ["left", AlignLeft],
                ["center", AlignCenter],
                ["right", AlignRight],
              ] as const
            ).map(([a, Icon]) => (
              <Button
                key={a}
                type="button"
                size="sm"
                variant={block.align === a ? "secondary" : "outline"}
                className="h-7 w-7 px-0"
                onClick={() => set({ align: a })}
              >
                <Icon className="h-3.5 w-3.5" />
              </Button>
            ))}
          </Row>
          <Row label="Color">
            <ColorInput value={block.color} onChange={(color) => set({ color })} />
          </Row>
          <Row label="Line height">
            <NumInput value={block.lineHeight} min={0.8} max={3} step={0.1} onChange={(v) => set({ lineHeight: v })} />
          </Row>
          <Row label="Fill">
            <input
              type="checkbox"
              checked={block.backgroundColor !== "transparent"}
              onChange={(e) =>
                set({ backgroundColor: e.target.checked ? "#ffffff" : "transparent" })
              }
            />
            {block.backgroundColor !== "transparent" && (
              <ColorInput
                value={block.backgroundColor}
                onChange={(backgroundColor) => set({ backgroundColor })}
              />
            )}
          </Row>
          {block.backgroundColor !== "transparent" && (
            <>
              <Row label="Padding">
                <NumInput value={block.padding} min={0} max={72} onChange={(v) => set({ padding: v })} />
              </Row>
              <Row label="Corner radius">
                <NumInput value={block.borderRadius} min={0} max={200} onChange={(v) => set({ borderRadius: v })} />
              </Row>
            </>
          )}
          {geometry}
        </div>
      );

    case "image": {
      const img = block as FlyerImageBlock;
      const dpi =
        img.url && img.naturalWidth ? effectiveDpi(img.naturalWidth, img.w) : null;
      return (
        <div className="space-y-2.5">
          <p className="text-sm font-medium">Image</p>
          {img.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img.url} alt="" className="h-24 w-full rounded border object-cover" />
          )}
          <ImageSourceControls
            campaignId={campaignId}
            aiEnabled={aiEnabled}
            aspect={aspectFor(img.w, img.h)}
            kind="illustration"
            onImage={(r) =>
              set({
                url: r.url,
                naturalWidth: r.naturalWidth,
                naturalHeight: r.naturalHeight,
              })
            }
            onBusyChange={(g) => onImageBusy?.(block.id, g)}
          />
          {dpi !== null && dpi < 150 && (
            <p className="rounded bg-amber-50 px-2 py-1 text-[11px] leading-snug text-amber-700">
              ~{dpi} DPI at this size — may look soft in print. Shrink the block
              or use a larger image (aim for 150+).
            </p>
          )}
          <Row label="Fit">
            <select
              className="h-7 rounded-md border bg-background px-1.5 text-xs"
              value={img.fit}
              onChange={(e) => set({ fit: e.target.value as "cover" | "contain" })}
            >
              <option value="cover">Fill (crop)</option>
              <option value="contain">Fit (letterbox)</option>
            </select>
          </Row>
          <Row label="Corner radius">
            <NumInput value={img.borderRadius} min={0} max={400} onChange={(v) => set({ borderRadius: v })} />
          </Row>
          <Row label="Opacity">
            <input
              type="range"
              min={0.05}
              max={1}
              step={0.05}
              value={img.opacity}
              onChange={(e) => set({ opacity: Number(e.target.value) })}
            />
          </Row>
          {geometry}
        </div>
      );
    }

    case "shape": {
      // Switching to a line pre-flattens it into a thin bar with rounded ends;
      // switching back to a 2D shape from a thin line restores a square.
      const pickShape = (kind: typeof block.shape) => {
        if (kind === "line" && block.shape !== "line") {
          set({ shape: kind, h: 4, borderRadius: 2 });
        } else if (kind !== "line" && block.shape === "line") {
          set({ shape: kind, h: block.w });
        } else {
          set({ shape: kind });
        }
      };
      return (
        <div className="space-y-2.5">
          <p className="text-sm font-medium">Shape</p>
          <div className="grid grid-cols-4 gap-1">
            {FLYER_SHAPES.map((s) => (
              <Button
                key={s.kind}
                type="button"
                size="sm"
                variant={block.shape === s.kind ? "secondary" : "outline"}
                className="h-7 px-0 text-[10px]"
                onClick={() => pickShape(s.kind)}
                title={s.label}
              >
                {s.label.slice(0, 5)}
              </Button>
            ))}
          </div>
          <Row label="Color">
            <ColorInput value={block.color} onChange={(color) => set({ color })} />
          </Row>
          <Row label="Opacity">
            <input
              type="range"
              min={0.05}
              max={1}
              step={0.05}
              value={block.opacity}
              onChange={(e) => set({ opacity: Number(e.target.value) })}
            />
          </Row>
          {(block.shape === "rect" || block.shape === "line") && (
            <Row label={block.shape === "line" ? "End rounding" : "Corner radius"}>
              <NumInput value={block.borderRadius} min={0} max={400} onChange={(v) => set({ borderRadius: v })} />
            </Row>
          )}
          {block.shape === "line" && (
            <Row label="Thickness">
              <NumInput value={Math.round(block.h)} min={1} max={60} onChange={(v) => set({ h: v })} />
            </Row>
          )}
          {geometry}
        </div>
      );
    }

    case "qr":
      return (
        <div className="space-y-2.5">
          <p className="text-sm font-medium">QR code</p>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Each patient gets their own scannable code. This block is required —
            move and restyle it, but it can&apos;t be deleted.
          </p>
          <Row label="Frame color">
            <ColorInput value={block.frameColor} onChange={(frameColor) => set({ frameColor })} />
          </Row>
          <div className="space-y-1">
            <Label className="text-xs">Caption</Label>
            <Input
              className="h-7 text-xs"
              value={block.caption}
              onChange={(e) => set({ caption: e.target.value })}
            />
          </div>
          {geometry}
        </div>
      );

    case "credit":
      return (
        <div className="space-y-2.5">
          <p className="text-sm font-medium">Credit box</p>
          <div className="space-y-1">
            <Label className="text-xs">Caption</Label>
            <Input
              className="h-7 text-xs"
              value={block.caption}
              onChange={(e) => set({ caption: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Label</Label>
            <Input
              className="h-7 text-xs"
              value={block.label}
              onChange={(e) => set({ label: e.target.value })}
            />
            <p className="text-[10px] text-muted-foreground">
              {"{{credit}}"} becomes the campaign&apos;s credit amount.
            </p>
          </div>
          <FontSelect value={block.font} onChange={(font) => set({ font })} />
          <Row label="Background">
            <ColorInput
              value={block.backgroundColor}
              onChange={(backgroundColor) => set({ backgroundColor })}
            />
          </Row>
          <Row label="Text color">
            <ColorInput value={block.textColor} onChange={(textColor) => set({ textColor })} />
          </Row>
          <Row label="Corner radius">
            <NumInput value={block.borderRadius} min={0} max={200} onChange={(v) => set({ borderRadius: v })} />
          </Row>
          {geometry}
        </div>
      );
  }
}
