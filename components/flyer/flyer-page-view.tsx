// Shared flyer renderer. This exact component draws the page in BOTH the
// editor canvas (scaled with CSS transform) and the print pipeline (true size
// → headless Chrome → PDF), so the preview is pixel-faithful to print.
// Keep it free of client hooks — it must render with renderToStaticMarkup.

import React from "react";
import {
  FLYER_FONTS,
  PAGE_H,
  PAGE_W,
  resolveTokens,
  type FlyerBackground,
  type FlyerBlock,
  type FlyerDocument,
  type FlyerRenderData,
  type FlyerShapeKind,
} from "@/lib/flyer/types";

// ---------------------------------------------------------------------------
// Shapes (inline SVG, stretched to the block box)
// ---------------------------------------------------------------------------

const SHAPE_PATHS: Record<Exclude<FlyerShapeKind, "rect" | "circle">, string> = {
  blob1:
    "M54.7,9.7 C68.6,13.5 80.9,22.4 87.5,34.8 C94.1,47.2 95,63.1 88.1,74.6 C81.2,86.1 66.5,93.2 51.6,94.5 C36.7,95.8 21.6,91.3 12.4,80.9 C3.2,70.5 -0.1,54.2 4.4,40.7 C8.9,27.2 21.2,16.5 34.4,11.5 C40.9,9 47.8,7.8 54.7,9.7 Z",
  blob2:
    "M77.6,13.8 C88.2,21.5 95.6,34.3 95.9,47.4 C96.2,60.5 89.4,73.9 78.6,82.6 C67.8,91.3 53,95.3 39.8,92.2 C26.6,89.1 15,79 8.6,66.4 C2.2,53.8 1,38.7 7.7,27.5 C14.4,16.3 29,9 43.9,7.2 C55.8,5.8 68.9,7.5 77.6,13.8 Z",
  wave: "M0,60 C16,40 33,40 50,60 C67,80 84,80 100,60 L100,100 L0,100 Z",
  tooth:
    "M50,8 C38,8 34,14 28,14 C18,14 12,24 13,38 C14,52 20,60 22,74 C24,86 28,93 33,92 C39,91 38,72 44,66 C47,63 53,63 56,66 C62,72 61,91 67,92 C72,93 76,86 78,74 C80,60 86,52 87,38 C88,24 82,14 72,14 C66,14 62,8 50,8 Z",
  sparkle: "M50,2 L61,39 L98,50 L61,61 L50,98 L39,61 L2,50 L39,39 Z",
  heart:
    "M50,91 C24,68 6,49 6,30 C6,15 17,5 30,5 C39,5 46,10 50,19 C54,10 61,5 70,5 C83,5 94,15 94,30 C94,49 76,68 50,91 Z",
};

function ShapeSvg({
  kind,
  color,
}: {
  kind: FlyerShapeKind;
  color: string;
}) {
  if (kind === "rect") return null; // plain div handles it (with borderRadius)
  if (kind === "circle") {
    return (
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        <ellipse cx="50" cy="50" rx="50" ry="50" fill={color} />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ width: "100%", height: "100%", display: "block" }}
    >
      <path d={SHAPE_PATHS[kind]} fill={color} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

function blockFrame(b: FlyerBlock): React.CSSProperties {
  return {
    position: "absolute",
    left: `${b.x}pt`,
    top: `${b.y}pt`,
    width: `${b.w}pt`,
    height: `${b.h}pt`,
    transform: b.rotation ? `rotate(${b.rotation}deg)` : undefined,
    transformOrigin: "center center",
  };
}

export function BlockView({
  block,
  data,
}: {
  block: FlyerBlock;
  data: FlyerRenderData;
}) {
  switch (block.type) {
    case "text":
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            fontFamily: FLYER_FONTS[block.font].family,
            fontSize: `${block.fontSize}pt`,
            fontWeight: block.bold ? 700 : 400,
            color: block.color,
            textAlign: block.align,
            lineHeight: block.lineHeight,
            backgroundColor:
              block.backgroundColor === "transparent"
                ? undefined
                : block.backgroundColor,
            padding: `${block.padding}pt`,
            borderRadius: `${block.borderRadius}pt`,
            whiteSpace: "pre-wrap",
            overflowWrap: "break-word",
            boxSizing: "border-box",
          }}
        >
          {resolveTokens(block.text, data)}
        </div>
      );

    case "image": {
      if (!block.url) {
        // Placeholder (visible in the editor; print simply shows nothing).
        return (
          <div
            style={{
              width: "100%",
              height: "100%",
              borderRadius: `${block.borderRadius}pt`,
              border: "1pt dashed #cbd5e1",
              backgroundColor: "#f8fafc",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#94a3b8",
              fontSize: "9pt",
              fontFamily: FLYER_FONTS.inter.family,
              boxSizing: "border-box",
            }}
          >
            Image
          </div>
        );
      }
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={block.url}
          alt=""
          style={{
            width: "100%",
            height: "100%",
            objectFit: block.fit,
            borderRadius: `${block.borderRadius}pt`,
            opacity: block.opacity,
            display: "block",
          }}
        />
      );
    }

    case "shape":
      if (block.shape === "rect") {
        return (
          <div
            style={{
              width: "100%",
              height: "100%",
              backgroundColor: block.color,
              opacity: block.opacity,
              borderRadius: `${block.borderRadius}pt`,
            }}
          />
        );
      }
      return (
        <div style={{ width: "100%", height: "100%", opacity: block.opacity }}>
          <ShapeSvg kind={block.shape} color={block.color} />
        </div>
      );

    case "qr":
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            backgroundColor: "#ffffff",
            border: `1pt solid ${block.frameColor}`,
            borderRadius: "8pt",
            padding: "8pt",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "4pt",
            boxSizing: "border-box",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.qrDataUrl}
            alt="QR code"
            style={{
              width: "100%",
              flex: 1,
              minHeight: 0,
              objectFit: "contain",
              display: "block",
            }}
          />
          {block.caption ? (
            <div
              style={{
                fontSize: "7pt",
                color: "#6b7280",
                fontFamily: FLYER_FONTS.inter.family,
                textAlign: "center",
                lineHeight: 1.2,
              }}
            >
              {block.caption}
            </div>
          ) : null}
        </div>
      );

    case "credit":
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            backgroundColor: block.backgroundColor,
            color: block.textColor,
            borderRadius: `${block.borderRadius}pt`,
            padding: "10pt 14pt",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10pt",
            fontFamily: FLYER_FONTS[block.font].family,
            boxSizing: "border-box",
          }}
        >
          <div style={{ fontSize: "9pt", opacity: 0.9 }}>
            {resolveTokens(block.caption, data)}
          </div>
          <div style={{ fontSize: "16pt", fontWeight: 700, textAlign: "right" }}>
            {resolveTokens(block.label, data)}
          </div>
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// Page background
// ---------------------------------------------------------------------------

function BackgroundView({ background }: { background: FlyerBackground }) {
  const base: React.CSSProperties = {
    position: "absolute",
    inset: 0,
  };
  switch (background.type) {
    case "solid":
      return <div style={{ ...base, backgroundColor: background.color }} />;
    case "gradient":
      return (
        <div
          style={{
            ...base,
            background: `linear-gradient(${background.angle}deg, ${background.from}, ${background.to})`,
          }}
        />
      );
    case "image":
      return (
        <>
          {background.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={background.url}
              alt=""
              style={{ ...base, width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <div style={{ ...base, backgroundColor: "#f1f5f9" }} />
          )}
          {background.overlayOpacity > 0 ? (
            <div
              style={{
                ...base,
                backgroundColor: background.overlayColor,
                opacity: background.overlayOpacity,
              }}
            />
          ) : null}
        </>
      );
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function FlyerPageView({
  doc,
  data,
  className,
  renderBlock,
}: {
  doc: FlyerDocument;
  data: FlyerRenderData;
  className?: string;
  /** Editor hook: wrap each block (selection chrome, drag handlers). The
   *  default renders the block as-is — which is what print uses. */
  renderBlock?: (block: FlyerBlock, content: React.ReactNode) => React.ReactNode;
}) {
  const sorted = [...doc.blocks].sort((a, b) => a.z - b.z);
  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: `${PAGE_W}pt`,
        height: `${PAGE_H}pt`,
        overflow: "hidden",
        backgroundColor: "#ffffff",
        fontFamily: FLYER_FONTS.inter.family,
      }}
    >
      <BackgroundView background={doc.page.background} />
      {sorted.map((block) => {
        const content = <BlockView block={block} data={data} />;
        return (
          <div key={block.id} style={blockFrame(block)} data-block-id={block.id}>
            {renderBlock ? renderBlock(block, content) : content}
          </div>
        );
      })}
    </div>
  );
}

export const SAMPLE_RENDER_DATA: Omit<FlyerRenderData, "qrDataUrl"> = {
  firstName: "Jane",
  fullName: "Jane Sample",
  practiceName: "Southern Smiles Dental",
  creditLabel: "$50",
  surveyUrl: "southernsmiles.com/survey/SAMPLE",
};
