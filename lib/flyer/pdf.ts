// HTML → PDF via headless Chrome. Environment-aware:
//   - PUPPETEER_EXECUTABLE_PATH env, if set (explicit override)
//   - Linux (serverless/CI): @sparticuz/chromium's bundled binary
//   - macOS/Windows dev: the locally installed Chrome ("chrome" channel)

import type { Browser } from "puppeteer-core";

let browserPromise: Promise<Browser> | null = null;

async function launchBrowser(): Promise<Browser> {
  const puppeteer = await import("puppeteer-core");

  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }

  if (process.platform === "linux") {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({
      executablePath: await chromium.executablePath(),
      args: chromium.args,
      headless: true,
    });
  }

  return puppeteer.launch({ channel: "chrome", headless: true });
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) browserPromise = launchBrowser();
  const browser = await browserPromise;
  if (!browser.connected) {
    browserPromise = launchBrowser();
    return browserPromise;
  }
  return browser;
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load", timeout: 60_000 });
    // Wait for every image (backgrounds, logos, QR data URLs) and all web
    // fonts before printing — "load" alone doesn't guarantee either.
    await page.evaluate(() =>
      Promise.all([
        (document as Document & { fonts: { ready: Promise<unknown> } }).fonts
          .ready,
        ...Array.from(document.images)
          .filter((img) => !img.complete)
          .map(
            (img) =>
              new Promise((resolve) => {
                img.onload = img.onerror = resolve;
              })
          ),
      ])
    );
    const pdf = await page.pdf({
      format: "letter",
      printBackground: true,
      preferCSSPageSize: true,
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
  }
}
