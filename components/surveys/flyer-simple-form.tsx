"use client";

// Simple editing mode — the original flyer form (heading, note, signature,
// accent color, background), but editing the SAME block document the canvas
// uses. Fields map onto role-tagged text blocks; switching tabs never loses
// anything, and Save/preview/PDF are shared with the canvas.

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BackgroundPanel } from "@/components/surveys/flyer-inspector";
import {
  PAGE_W,
  findRoleBlock,
  flyerId,
  type FlyerBackground,
  type FlyerBlock,
  type FlyerDocument,
  type FlyerTextBlock,
  type FlyerTextRole,
} from "@/lib/flyer/types";

type Commit = (
  updater: (d: FlyerDocument) => FlyerDocument,
  snapshotKey: string | null
) => void;

/** Defaults used when a form field has no matching block yet (e.g. the
 *  heading was deleted on the canvas) and the user starts typing. */
const NEW_BLOCK_DEFAULTS: Record<
  FlyerTextRole,
  Omit<FlyerTextBlock, "id" | "text" | "z">
> = {
  heading: {
    type: "text",
    role: "heading",
    font: "playfair",
    fontSize: 26,
    bold: true,
    color: "#0f766e",
    align: "left",
    lineHeight: 1.2,
    backgroundColor: "transparent",
    padding: 0,
    borderRadius: 0,
    x: 68,
    y: 64,
    w: PAGE_W - 136,
    h: 36,
    rotation: 0,
  },
  body: {
    type: "text",
    role: "body",
    font: "inter",
    fontSize: 11,
    bold: false,
    color: "#374151",
    align: "left",
    lineHeight: 1.55,
    backgroundColor: "transparent",
    padding: 0,
    borderRadius: 0,
    x: 68,
    y: 120,
    w: PAGE_W - 136,
    h: 170,
    rotation: 0,
  },
  signature: {
    type: "text",
    role: "signature",
    font: "caveat",
    fontSize: 18,
    bold: false,
    color: "#374151",
    align: "left",
    lineHeight: 1.3,
    backgroundColor: "transparent",
    padding: 0,
    borderRadius: 0,
    x: 68,
    y: 470,
    w: PAGE_W - 136,
    h: 52,
    rotation: 0,
  },
};

export function FlyerSimpleForm({
  campaignId,
  doc,
  commit,
  aiEnabled,
}: {
  campaignId: string;
  doc: FlyerDocument;
  commit: Commit;
  aiEnabled: boolean;
}) {
  const heading = findRoleBlock(doc, "heading");
  const body = findRoleBlock(doc, "body");
  const signature = findRoleBlock(doc, "signature");
  const credit = doc.blocks.find((b) => b.type === "credit");
  const qr = doc.blocks.find((b) => b.type === "qr");

  const accent =
    heading?.color ?? credit?.backgroundColor ?? qr?.frameColor ?? "#0f766e";

  /** Update the role block's text, creating the block if it doesn't exist. */
  function setRoleText(role: FlyerTextRole, text: string) {
    commit((d) => {
      const existing = findRoleBlock(d, role);
      if (existing) {
        return {
          ...d,
          blocks: d.blocks.map((b) =>
            b.id === existing.id ? { ...b, role, text } : b
          ),
        };
      }
      const block: FlyerBlock = {
        ...NEW_BLOCK_DEFAULTS[role],
        ...(role === "heading" ? { color: accent } : {}),
        id: flyerId(),
        text,
        z: Math.max(0, ...d.blocks.map((b) => b.z)) + 1,
      };
      return { ...d, blocks: [...d.blocks, block] };
    }, `simple-${role}`);
  }

  /** The accent color drives the heading, credit box, and QR frame together —
   *  same behavior as the original editor. */
  function setAccent(color: string) {
    commit(
      (d) => ({
        ...d,
        blocks: d.blocks.map((b) => {
          if (b.type === "text" && findRoleBlock(d, "heading")?.id === b.id)
            return { ...b, color };
          if (b.type === "credit") return { ...b, backgroundColor: color };
          if (b.type === "qr") return { ...b, frameColor: color };
          return b;
        }),
      }),
      "simple-accent"
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="sf-heading">Heading</Label>
        <Input
          id="sf-heading"
          value={heading?.text ?? ""}
          onChange={(e) => setRoleText("heading", e.target.value)}
          placeholder="A Personal Note"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="sf-body">Note body</Label>
        <Textarea
          id="sf-body"
          rows={6}
          value={body?.text ?? ""}
          onChange={(e) => setRoleText("body", e.target.value)}
          placeholder={"Dear {{first_name}},\n\nOur practice exists because of patients like you…"}
        />
        <p className="text-xs text-muted-foreground">
          {"{{first_name}}"} becomes each patient&apos;s name.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="sf-sig">Signature</Label>
        <Textarea
          id="sf-sig"
          rows={2}
          value={signature?.text ?? ""}
          onChange={(e) => setRoleText("signature", e.target.value)}
          placeholder={"With gratitude,\nDr. Shakally"}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="sf-accent">Accent color</Label>
        <input
          id="sf-accent"
          type="color"
          value={accent}
          onChange={(e) => setAccent(e.target.value)}
          className="h-9 w-16 cursor-pointer rounded border bg-background"
        />
        <p className="text-xs text-muted-foreground">
          Colors the heading, credit box, and QR frame together.
        </p>
      </div>

      <div className="rounded-lg border p-3">
        <BackgroundPanel
          campaignId={campaignId}
          background={doc.page.background}
          aiEnabled={aiEnabled}
          patchBackground={(bg: FlyerBackground, key: string | null) =>
            commit((d) => ({ ...d, page: { ...d.page, background: bg } }), key)
          }
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Want more control? The <span className="font-medium">Canvas</span> tab
        lets you move, resize, and restyle every element on the page.
      </p>
    </div>
  );
}
