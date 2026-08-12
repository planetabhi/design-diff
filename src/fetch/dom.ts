// Screenshot the page at a fixed size (the Figma frame's box), with render gates.

import { chromium, type Browser } from "playwright-core";

export interface ScreenshotOptions {
  url: string;
  size: { w: number; h: number }; // CSS px — the Figma frame's box
  deviceScaleFactor: number;
  outPath: string;
  authStateRef?: string; // Playwright storageState path for logged-in pages
}

export interface Readiness {
  fontsReady: boolean;
  imagesComplete: boolean;
  animationsDisabled: boolean;
  reducedMotion: boolean;
}

export interface ScreenshotResult {
  path: string;
  width: number; // device px
  height: number; // device px
  readiness: Readiness;
}

/** Load the page, wait for it to settle, and clip a screenshot to the frame size. */
export async function screenshotPage(opts: ScreenshotOptions): Promise<ScreenshotResult> {
  const w = Math.round(opts.size.w);
  const h = Math.round(opts.size.h);
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: w, height: h },
      deviceScaleFactor: opts.deviceScaleFactor,
      reducedMotion: "reduce",
      ...(opts.authStateRef ? { storageState: opts.authStateRef } : {}),
    });
    const page = await context.newPage();
    await page.goto(opts.url, { waitUntil: "load" });

    const fontsReady = await page.evaluate(async () => {
      await document.fonts.ready;
      return document.fonts.status === "loaded";
    });
    const imagesComplete = await page.evaluate(async () => {
      const imgs = Array.from(document.images);
      await Promise.all(
        imgs.map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>((res) => {
                img.addEventListener("load", () => res(), { once: true });
                img.addEventListener("error", () => res(), { once: true });
              })
        )
      );
      return imgs.every((img) => img.complete);
    });
    await page.waitForLoadState("networkidle");
    await page.addStyleTag({
      content:
        "*{animation:none!important;transition:none!important;caret-color:transparent!important}",
    });
    const reducedMotion = await page.evaluate(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches
    );

    await page.screenshot({
      path: opts.outPath,
      clip: { x: 0, y: 0, width: w, height: h },
    });

    return {
      path: opts.outPath,
      width: Math.round(w * opts.deviceScaleFactor),
      height: Math.round(h * opts.deviceScaleFactor),
      readiness: { fontsReady, imagesComplete, animationsDisabled: true, reducedMotion },
    };
  } finally {
    await browser?.close();
  }
}
