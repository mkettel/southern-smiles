// Builds the full print HTML for a flyer batch: one FlyerPageView per
// recipient, Google Fonts for every font the document uses, and print CSS
// that maps each page div onto one US Letter PDF page.

import React from "react";
import { FlyerPageView } from "@/components/flyer/flyer-page-view";
import {
  fontsInDocument,
  googleFontsUrl,
  type FlyerDocument,
  type FlyerRenderData,
} from "@/lib/flyer/types";

export async function buildFlyerHtml(
  doc: FlyerDocument,
  recipients: FlyerRenderData[]
): Promise<string> {
  // Next.js disallows bundling react-dom/server into app-router code (it
  // assumes you're rendering UI, where streaming RSC is the right tool).
  // Here we're producing a standalone HTML artifact for the PDF printer, so
  // we load it at runtime, outside the bundler's graph.
  const { renderToStaticMarkup } = await import(
    /* webpackIgnore: true */ /* turbopackIgnore: true */ "react-dom/server"
  );

  const pages = renderToStaticMarkup(
    React.createElement(
      React.Fragment,
      null,
      recipients.map((data, i) =>
        React.createElement(FlyerPageView, {
          key: i,
          doc,
          data,
          className: "flyer-page",
        })
      )
    )
  );

  const fontsHref = googleFontsUrl(fontsInDocument(doc));

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="${fontsHref}" />
<style>
  @page { size: letter; margin: 0; }
  html, body { margin: 0; padding: 0; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .flyer-page { break-after: page; page-break-after: always; }
  .flyer-page:last-child { break-after: auto; page-break-after: auto; }
</style>
</head>
<body>${pages}</body>
</html>`;
}
