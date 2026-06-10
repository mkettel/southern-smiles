"use client";

// Canvas flyer designer. Renders the shared FlyerPageView (the exact component
// the print pipeline uses) scaled to fit, and layers editing chrome on top:
// selection, drag/resize with snap guides, undo/redo, safe-zone overlay, and
// a block inspector. Coordinates are stored in page points; pointer deltas are
// converted px → pt (× 0.75) and divided by the current canvas scale.

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import QRCode from "qrcode";
import { format, isToday } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FlyerPageView } from "@/components/flyer/flyer-page-view";
import { FlyerInspector } from "@/components/surveys/flyer-inspector";
import { FlyerSimpleForm } from "@/components/surveys/flyer-simple-form";
import { saveFlyerDocument, generateAiFlyerDocument } from "@/actions/flyers";
import {
  PAGE_H,
  PAGE_W,
  SAFE_MARGIN,
  flyerId,
  fontsInDocument,
  googleFontsUrl,
  type FlyerBlock,
  type FlyerDocument,
  type FlyerRenderData,
} from "@/lib/flyer/types";
import {
  BringToFront,
  Copy,
  Download,
  Eye,
  Frame,
  ImageIcon,
  Redo2,
  Save,
  SendToBack,
  Shapes,
  Sparkles,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";

const PX_PER_PT = 96 / 72;
const SNAP_PT = 4;
const BLANK_QR =
  "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";

type HandleKey = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

const HANDLES: { key: HandleKey; cursor: string }[] = [
  { key: "nw", cursor: "nwse-resize" },
  { key: "n", cursor: "ns-resize" },
  { key: "ne", cursor: "nesw-resize" },
  { key: "e", cursor: "ew-resize" },
  { key: "se", cursor: "nwse-resize" },
  { key: "s", cursor: "ns-resize" },
  { key: "sw", cursor: "nesw-resize" },
  { key: "w", cursor: "ew-resize" },
];

interface DragState {
  mode: "move" | "resize";
  handle?: HandleKey;
  blockId: string;
  startPx: { x: number; y: number };
  orig: { x: number; y: number; w: number; h: number };
  moved: boolean;
}

/** Serialized form used to detect unsaved changes (savedAt itself excluded). */
function docKey(doc: FlyerDocument): string {
  return JSON.stringify({ ...doc, savedAt: undefined });
}

function formatSavedAt(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return isToday(d) ? format(d, "h:mm a") : format(d, "MMM d 'at' h:mm a");
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable)
  );
}

export function FlyerDesigner({
  campaignId,
  initialDocument,
  practiceName,
  creditLabel,
  aiEnabled,
}: {
  campaignId: string;
  initialDocument: FlyerDocument;
  practiceName: string;
  creditLabel: string;
  aiEnabled: boolean;
}) {
  const [doc, setDocState] = useState<FlyerDocument>(initialDocument);
  const docRef = useRef(doc);
  docRef.current = doc;

  // "simple" = the original form fields; "canvas" = full block editing.
  // Both edit the same document, so switching tabs never loses work.
  const [mode, setMode] = useState<"simple" | "canvas">("simple");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scale, setScale] = useState(0.6);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({
    x: null,
    y: null,
  });
  const [showSafe, setShowSafe] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiBrief, setAiBrief] = useState("");
  const [aiTone, setAiTone] = useState<"warm" | "playful" | "professional">("warm");
  const [sampleQr, setSampleQr] = useState(BLANK_QR);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(
    initialDocument.savedAt ?? null
  );
  const savedKeyRef = useRef(docKey(initialDocument));
  // Format times only after mount — the server may be in a different
  // timezone, which would cause a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // ---- history (refs + version bump so drag frames stay cheap) ----
  const historyRef = useRef<FlyerDocument[]>([]);
  const futureRef = useRef<FlyerDocument[]>([]);
  const lastSnapRef = useRef<{ key: string; time: number }>({ key: "", time: 0 });
  const [, bump] = useReducer((c: number) => c + 1, 0);

  const pushSnapshot = useCallback((prev: FlyerDocument, key: string) => {
    const now = Date.now();
    // Coalesce bursts (typing, color scrubbing) into one undo step.
    if (lastSnapRef.current.key === key && now - lastSnapRef.current.time < 700) {
      lastSnapRef.current.time = now;
      return;
    }
    lastSnapRef.current = { key, time: now };
    historyRef.current = [...historyRef.current.slice(-79), prev];
    futureRef.current = [];
    bump();
  }, []);

  /** Apply a document update. `snapshotKey` groups undo steps; pass null for
   *  transient frames (mid-drag) that shouldn't create history. */
  const commit = useCallback(
    (updater: (d: FlyerDocument) => FlyerDocument, snapshotKey: string | null) => {
      const prev = docRef.current;
      const next = updater(prev);
      if (next === prev) return;
      if (snapshotKey !== null) pushSnapshot(prev, snapshotKey);
      setDocState(next);
    },
    [pushSnapshot]
  );

  const undo = useCallback(() => {
    const prev = historyRef.current.pop();
    if (!prev) return;
    futureRef.current = [docRef.current, ...futureRef.current.slice(0, 79)];
    lastSnapRef.current = { key: "", time: 0 };
    setDocState(prev);
    bump();
  }, []);

  const redo = useCallback(() => {
    const next = futureRef.current.shift();
    if (!next) return;
    historyRef.current = [...historyRef.current.slice(-79), docRef.current];
    lastSnapRef.current = { key: "", time: 0 };
    setDocState(next);
    bump();
  }, []);

  // ---- canvas scale ----
  const outerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (mode !== "canvas") return; // canvas not mounted in simple mode
    const el = outerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      if (w > 0) setScale(Math.min(1.2, w / (PAGE_W * PX_PER_PT)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode]);

  // ---- sample QR for the canvas preview ----
  useEffect(() => {
    QRCode.toDataURL(`${window.location.origin}/survey/SAMPLE`, {
      margin: 1,
      width: 600,
      errorCorrectionLevel: "M",
    })
      .then(setSampleQr)
      .catch(() => {});
  }, []);

  const sampleData: FlyerRenderData = useMemo(
    () => ({
      firstName: "Jane",
      fullName: "Jane Sample",
      practiceName,
      creditLabel,
      surveyUrl: "…/survey/SAMPLE",
      qrDataUrl: sampleQr,
    }),
    [practiceName, creditLabel, sampleQr]
  );

  const selected = doc.blocks.find((b) => b.id === selectedId) ?? null;

  // ---- block ops ----
  const patchBlock = useCallback(
    (id: string, patch: Partial<FlyerBlock>, snapshotKey: string | null) => {
      commit(
        (d) => ({
          ...d,
          blocks: d.blocks.map((b) =>
            b.id === id ? ({ ...b, ...patch } as FlyerBlock) : b
          ),
        }),
        snapshotKey
      );
    },
    [commit]
  );

  const addBlock = useCallback(
    (block: FlyerBlock) => {
      commit((d) => ({ ...d, blocks: [...d.blocks, block] }), `add-${block.id}`);
      setSelectedId(block.id);
    },
    [commit]
  );

  const maxZ = () => Math.max(0, ...docRef.current.blocks.map((b) => b.z));

  const addText = () =>
    addBlock({
      id: flyerId(),
      type: "text",
      text: "Double-click to edit this text",
      font: "poppins",
      fontSize: 16,
      bold: false,
      color: "#1f2937",
      align: "left",
      lineHeight: 1.4,
      backgroundColor: "transparent",
      padding: 0,
      borderRadius: 0,
      x: PAGE_W / 2 - 120,
      y: PAGE_H / 2 - 20,
      w: 240,
      h: 48,
      rotation: 0,
      z: maxZ() + 1,
    });

  const addImage = () =>
    addBlock({
      id: flyerId(),
      type: "image",
      url: null,
      fit: "cover",
      borderRadius: 8,
      opacity: 1,
      x: PAGE_W / 2 - 90,
      y: PAGE_H / 2 - 60,
      w: 180,
      h: 120,
      rotation: 0,
      z: maxZ() + 1,
    });

  const addShape = () =>
    addBlock({
      id: flyerId(),
      type: "shape",
      shape: "blob1",
      color: "#99f6e4",
      opacity: 1,
      borderRadius: 0,
      x: PAGE_W / 2 - 60,
      y: PAGE_H / 2 - 60,
      w: 120,
      h: 120,
      rotation: 0,
      z: maxZ() + 1,
    });

  const duplicateSelected = useCallback(() => {
    const b = docRef.current.blocks.find((x) => x.id === selectedId);
    if (!b || b.type === "qr") return;
    const copy = { ...b, id: flyerId(), x: b.x + 14, y: b.y + 14, z: maxZ() + 1 };
    commit((d) => ({ ...d, blocks: [...d.blocks, copy] }), `dup-${copy.id}`);
    setSelectedId(copy.id);
  }, [commit, selectedId]);

  const deleteSelected = useCallback(() => {
    const b = docRef.current.blocks.find((x) => x.id === selectedId);
    if (!b) return;
    if (b.type === "qr") {
      toast.error("The QR code is required — every flyer needs its survey link");
      return;
    }
    commit(
      (d) => ({ ...d, blocks: d.blocks.filter((x) => x.id !== b.id) }),
      `del-${b.id}`
    );
    setSelectedId(null);
  }, [commit, selectedId]);

  const reorderSelected = useCallback(
    (dir: 1 | -1) => {
      if (!selectedId) return;
      commit((d) => {
        const zs = d.blocks.map((b) => b.z);
        const top = Math.max(...zs);
        const bottom = Math.min(...zs);
        return {
          ...d,
          blocks: d.blocks.map((b) =>
            b.id === selectedId
              ? { ...b, z: dir === 1 ? top + 1 : Math.max(0, bottom - 1) }
              : b
          ),
        };
      }, `z-${selectedId}`);
    },
    [commit, selectedId]
  );

  // ---- drag / resize ----
  const dragRef = useRef<DragState | null>(null);

  const snapAxis = useCallback(
    (
      pos: number,
      size: number,
      pageLen: number,
      others: { start: number; len: number }[]
    ): { pos: number; guide: number | null } => {
      const lines = [
        SAFE_MARGIN,
        pageLen / 2,
        pageLen - SAFE_MARGIN,
        ...others.flatMap((o) => [o.start, o.start + o.len / 2, o.start + o.len]),
      ];
      let best: { pos: number; guide: number; d: number } | null = null;
      for (const g of lines) {
        const tries: [number, number][] = [
          [g, g], // align start edge
          [g - size / 2, g], // align center
          [g - size, g], // align end edge
        ];
        for (const [candidate, guide] of tries) {
          const d = Math.abs(pos - candidate);
          if (d < SNAP_PT && (!best || d < best.d)) {
            best = { pos: candidate, guide, d };
          }
        }
      }
      return best ? { pos: best.pos, guide: best.guide } : { pos, guide: null };
    },
    []
  );

  const onDragMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const k = 0.75 / scaleRef.current; // px → pt at current zoom
      const dx = (e.clientX - drag.startPx.x) * k;
      const dy = (e.clientY - drag.startPx.y) * k;

      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 1) return;
      if (!drag.moved) {
        drag.moved = true;
        pushSnapshot(docRef.current, `drag-${drag.blockId}-${drag.startPx.x}`);
      }

      if (drag.mode === "move") {
        const others = docRef.current.blocks
          .filter((b) => b.id !== drag.blockId)
          .map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }));
        const sx = snapAxis(
          drag.orig.x + dx,
          drag.orig.w,
          PAGE_W,
          others.map((o) => ({ start: o.x, len: o.w }))
        );
        const sy = snapAxis(
          drag.orig.y + dy,
          drag.orig.h,
          PAGE_H,
          others.map((o) => ({ start: o.y, len: o.h }))
        );
        setGuides({ x: sx.guide, y: sy.guide });
        commit(
          (d) => ({
            ...d,
            blocks: d.blocks.map((b) =>
              b.id === drag.blockId ? { ...b, x: sx.pos, y: sy.pos } : b
            ),
          }),
          null
        );
      } else {
        const handle = drag.handle!;
        let { x, y, w, h } = drag.orig;
        if (handle.includes("e")) w = drag.orig.w + dx;
        if (handle.includes("w")) w = drag.orig.w - dx;
        if (handle.includes("s")) h = drag.orig.h + dy;
        if (handle.includes("n")) h = drag.orig.h - dy;
        w = Math.max(12, w);
        h = Math.max(12, h);
        if (handle.includes("w")) x = drag.orig.x + (drag.orig.w - w);
        if (handle.includes("n")) y = drag.orig.y + (drag.orig.h - h);
        commit(
          (d) => ({
            ...d,
            blocks: d.blocks.map((b) =>
              b.id === drag.blockId ? { ...b, x, y, w, h } : b
            ),
          }),
          null
        );
      }
    },
    [commit, pushSnapshot, snapAxis]
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setGuides({ x: null, y: null });
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", endDrag);
  }, [onDragMove]);

  const beginDrag = useCallback(
    (
      e: React.PointerEvent,
      blockId: string,
      mode: "move" | "resize",
      handle?: HandleKey
    ) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const b = docRef.current.blocks.find((x) => x.id === blockId);
      if (!b) return;
      setSelectedId(blockId);
      dragRef.current = {
        mode,
        handle,
        blockId,
        startPx: { x: e.clientX, y: e.clientY },
        orig: { x: b.x, y: b.y, w: b.w, h: b.h },
        moved: false,
      };
      window.addEventListener("pointermove", onDragMove);
      window.addEventListener("pointerup", endDrag);
    },
    [endDrag, onDragMove]
  );

  useEffect(() => endDrag, [endDrag]); // clean up listeners on unmount

  // ---- keyboard ----
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelected();
        return;
      }
      if (!selectedId) return;
      if (e.key === "Escape") {
        setSelectedId(null);
        return;
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        deleteSelected();
        return;
      }
      const step = e.shiftKey ? 10 : 1;
      const nudge: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      if (nudge[e.key]) {
        e.preventDefault();
        const [dx, dy] = nudge[e.key];
        const id = selectedId;
        commit(
          (d) => ({
            ...d,
            blocks: d.blocks.map((b) =>
              b.id === id ? { ...b, x: b.x + dx, y: b.y + dy } : b
            ),
          }),
          `nudge-${id}`
        );
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commit, deleteSelected, duplicateSelected, redo, selectedId, undo]);

  // ---- save / preview / generate ----
  async function save() {
    setBusy("save");
    const res = await saveFlyerDocument(campaignId, docRef.current);
    setBusy(null);
    if (res.error) {
      toast.error(typeof res.error === "string" ? res.error : "Could not save");
      return;
    }
    savedKeyRef.current = docKey(docRef.current);
    setLastSavedAt(res.savedAt ?? new Date().toISOString());
    toast.success("Flyer saved");
  }

  async function printPreview() {
    setBusy("preview");
    try {
      const res = await fetch(`/api/flyer/${campaignId}?preview=1`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(docRef.current),
      });
      if (!res.ok) {
        toast.error("Could not render the preview");
        return;
      }
      const blob = await res.blob();
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(blob);
      });
    } finally {
      setBusy(null);
    }
  }

  async function generatePdf() {
    setBusy("gen");
    try {
      const res = await fetch(`/api/flyer/${campaignId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(docRef.current),
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

  async function aiGenerate() {
    if (!aiBrief.trim()) {
      toast.error("Describe the flyer you want");
      return;
    }
    setBusy("ai");
    const res = await generateAiFlyerDocument({
      campaign_id: campaignId,
      brief: aiBrief,
      tone: aiTone,
    });
    setBusy(null);
    if (res.error || !res.document) {
      toast.error(typeof res.error === "string" ? res.error : "Generation failed");
      return;
    }
    commit(() => res.document as FlyerDocument, `ai-${Date.now()}`);
    setSelectedId(null);
    toast.success("AI design ready — tweak anything, then Save");
  }

  // ---- editor chrome around each block ----
  const renderEditorBlock = (block: FlyerBlock, content: React.ReactNode) => {
    const isSelected = block.id === selectedId;
    const hs = 10 / scale; // handle size, screen-constant
    return (
      <div
        onPointerDown={(e) => beginDrag(e, block.id, "move")}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          cursor: "move",
          touchAction: "none",
          outline: isSelected
            ? `${1.5 / scale}px solid #3b82f6`
            : `${1 / scale}px dashed transparent`,
        }}
      >
        <div style={{ width: "100%", height: "100%", pointerEvents: "none" }}>
          {content}
        </div>
        {isSelected &&
          HANDLES.map((h) => {
            const pos: React.CSSProperties = {};
            if (h.key.includes("w")) pos.left = -hs / 2;
            else if (h.key.includes("e")) pos.right = -hs / 2;
            else pos.left = `calc(50% - ${hs / 2}px)`;
            if (h.key.includes("n")) pos.top = -hs / 2;
            else if (h.key.includes("s")) pos.bottom = -hs / 2;
            else pos.top = `calc(50% - ${hs / 2}px)`;
            return (
              <div
                key={h.key}
                onPointerDown={(e) => beginDrag(e, block.id, "resize", h.key)}
                style={{
                  position: "absolute",
                  width: hs,
                  height: hs,
                  background: "#ffffff",
                  border: `${1.5 / scale}px solid #3b82f6`,
                  borderRadius: 2 / scale,
                  cursor: h.cursor,
                  touchAction: "none",
                  ...pos,
                }}
              />
            );
          })}
      </div>
    );
  };

  const canUndo = historyRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;
  const pagePx = { w: PAGE_W * PX_PER_PT, h: PAGE_H * PX_PER_PT };

  return (
    <div className="space-y-3">
      {/* Google fonts for the editor canvas (print loads its own copy). */}
      <link
        rel="stylesheet"
        precedence="default"
        href={googleFontsUrl(fontsInDocument(doc))}
      />

      {/* Mode tabs + AI */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex rounded-lg border p-0.5">
          {(["simple", "canvas"] as const).map((m) => (
            <Button
              key={m}
              type="button"
              size="sm"
              variant={mode === m ? "secondary" : "ghost"}
              className="capitalize"
              onClick={() => {
                setMode(m);
                if (m === "simple") setSelectedId(null);
              }}
            >
              {m}
            </Button>
          ))}
        </div>
        <div className="ml-auto">
          <Button
            variant={aiOpen ? "secondary" : "outline"}
            size="sm"
            onClick={() => setAiOpen((o) => !o)}
          >
            <Sparkles className="mr-1 h-4 w-4" /> AI design
          </Button>
        </div>
      </div>

      {/* Canvas toolbar */}
      {mode === "canvas" && (
      <div className="flex flex-wrap items-center gap-1.5">
        <Button variant="outline" size="sm" onClick={addText}>
          <Type className="mr-1 h-4 w-4" /> Text
        </Button>
        <Button variant="outline" size="sm" onClick={addImage}>
          <ImageIcon className="mr-1 h-4 w-4" /> Image
        </Button>
        <Button variant="outline" size="sm" onClick={addShape}>
          <Shapes className="mr-1 h-4 w-4" /> Shape
        </Button>
        <div className="mx-1 h-5 w-px bg-border" />
        <Button variant="ghost" size="sm" onClick={undo} disabled={!canUndo} title="Undo (⌘Z)">
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={redo} disabled={!canRedo} title="Redo (⇧⌘Z)">
          <Redo2 className="h-4 w-4" />
        </Button>
        <Button
          variant={showSafe ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setShowSafe((s) => !s)}
          title="Toggle printer safe-zone guide"
        >
          <Frame className="h-4 w-4" />
        </Button>
        {selected && (
          <>
            <div className="mx-1 h-5 w-px bg-border" />
            <Button variant="ghost" size="sm" onClick={duplicateSelected} title="Duplicate (⌘D)" disabled={selected.type === "qr"}>
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => reorderSelected(1)} title="Bring to front">
              <BringToFront className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => reorderSelected(-1)} title="Send to back">
              <SendToBack className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={deleteSelected} title="Delete" disabled={selected.type === "qr"}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
      )}

      {/* AI design panel */}
      {aiOpen && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          {aiEnabled ? (
            <>
              <Label htmlFor="ai-brief">Describe the flyer you want</Label>
              <Textarea
                id="ai-brief"
                rows={2}
                value={aiBrief}
                onChange={(e) => setAiBrief(e.target.value)}
                placeholder="e.g. A cheerful spring check-up reminder for patients we haven't seen in a year — mention the $50 credit"
              />
              <div className="flex items-center gap-2">
                <select
                  className="h-8 rounded-md border bg-background px-2 text-sm"
                  value={aiTone}
                  onChange={(e) =>
                    setAiTone(e.target.value as "warm" | "playful" | "professional")
                  }
                >
                  <option value="warm">Warm</option>
                  <option value="playful">Playful</option>
                  <option value="professional">Professional</option>
                </select>
                <Button size="sm" onClick={aiGenerate} disabled={busy !== null}>
                  <Sparkles className="mr-1 h-4 w-4" />
                  {busy === "ai" ? "Designing… (~30s)" : "Generate design"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  Replaces the canvas — undo brings your design back.
                </span>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              AI design needs <code>OPENAI_API_KEY</code> configured on the server.
            </p>
          )}
        </div>
      )}

      {/* Simple mode: the original form, editing the same document */}
      {mode === "simple" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <FlyerSimpleForm
            campaignId={campaignId}
            doc={doc}
            commit={commit}
            aiEnabled={aiEnabled}
          />
          <div className="min-w-0">
            <ScaledFlyerPreview doc={doc} data={sampleData} />
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Live preview with sample data — real flyers use each
              patient&apos;s name and unique QR code.
            </p>
          </div>
        </div>
      )}

      {mode === "canvas" && (
      <div className="grid gap-4 lg:grid-cols-[1fr_290px]">
        {/* Canvas */}
        <div ref={outerRef} className="min-w-0">
          <div
            className="relative mx-auto overflow-hidden rounded-md border shadow-sm"
            style={{ width: pagePx.w * scale, height: pagePx.h * scale }}
            onPointerDown={() => setSelectedId(null)}
          >
            <div
              style={{
                transform: `scale(${scale})`,
                transformOrigin: "top left",
                width: pagePx.w,
                height: pagePx.h,
              }}
            >
              <FlyerPageView
                doc={doc}
                data={sampleData}
                renderBlock={renderEditorBlock}
              />
              {/* Overlays (safe zone + snap guides) */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                }}
              >
                {showSafe && (
                  <div
                    style={{
                      position: "absolute",
                      left: `${SAFE_MARGIN}pt`,
                      top: `${SAFE_MARGIN}pt`,
                      width: `${PAGE_W - SAFE_MARGIN * 2}pt`,
                      height: `${PAGE_H - SAFE_MARGIN * 2}pt`,
                      border: `${1 / scale}px dashed #94a3b8`,
                      opacity: 0.6,
                    }}
                  />
                )}
                {guides.x !== null && (
                  <div
                    style={{
                      position: "absolute",
                      left: `${guides.x}pt`,
                      top: 0,
                      bottom: 0,
                      width: 1 / scale,
                      background: "#ec4899",
                    }}
                  />
                )}
                {guides.y !== null && (
                  <div
                    style={{
                      position: "absolute",
                      top: `${guides.y}pt`,
                      left: 0,
                      right: 0,
                      height: 1 / scale,
                      background: "#ec4899",
                    }}
                  />
                )}
              </div>
            </div>
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Previewing with sample data — real flyers use each patient&apos;s name
            and unique QR code. Drag to move · handles to resize · arrows to nudge.
          </p>
        </div>

        {/* Inspector */}
        <FlyerInspector
          campaignId={campaignId}
          doc={doc}
          selected={selected}
          aiEnabled={aiEnabled}
          patchBlock={patchBlock}
          patchBackground={(bg, key) =>
            commit((d) => ({ ...d, page: { ...d.page, background: bg } }), key)
          }
        />
      </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <Button onClick={save} disabled={busy !== null}>
          <Save className="mr-1.5 h-4 w-4" />
          {busy === "save" ? "Saving…" : "Save"}
        </Button>
        <Button variant="outline" onClick={printPreview} disabled={busy !== null}>
          <Eye className="mr-1.5 h-4 w-4" />
          {busy === "preview" ? "Rendering…" : "Print preview"}
        </Button>
        <Button variant="outline" onClick={generatePdf} disabled={busy !== null}>
          <Download className="mr-1.5 h-4 w-4" />
          {busy === "gen" ? "Generating…" : "Generate flyers (PDF)"}
        </Button>
        {mounted && (
          <span className="text-xs text-muted-foreground">
            {lastSavedAt && formatSavedAt(lastSavedAt)
              ? `Last saved ${formatSavedAt(lastSavedAt)}`
              : "Not saved yet"}
            {docKey(doc) !== savedKeyRef.current && (
              <span className="ml-1.5 font-medium text-amber-600">
                · unsaved changes
              </span>
            )}
          </span>
        )}
      </div>

      {/* Exact print output (headless Chrome render of the current design) */}
      {previewUrl && (
        <iframe
          src={previewUrl}
          className="h-[640px] w-full rounded-lg border bg-muted"
          title="Print preview"
        />
      )}
    </div>
  );
}

/** Non-interactive, auto-scaled render of the flyer (Simple mode preview). */
function ScaledFlyerPreview({
  doc,
  data,
}: {
  doc: FlyerDocument;
  data: FlyerRenderData;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      if (w > 0) setScale(Math.min(1, w / (PAGE_W * PX_PER_PT)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className="min-w-0">
      <div
        className="mx-auto overflow-hidden rounded-md border shadow-sm"
        style={{
          width: PAGE_W * PX_PER_PT * scale,
          height: PAGE_H * PX_PER_PT * scale,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            width: PAGE_W * PX_PER_PT,
          }}
        >
          <FlyerPageView doc={doc} data={data} />
        </div>
      </div>
    </div>
  );
}
