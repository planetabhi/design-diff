import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { chromium, type Browser } from "playwright-core";

export interface ScreenshotOptions {
  url: string;
  size: { w: number; h: number };
  deviceScaleFactor: number;
  outPath: string;
  authStateRef?: string;
  browser?: Browser;
}

export interface Readiness {
  fontsReady: boolean;
  imagesComplete: boolean;
}

export interface ScreenshotResult {
  path: string;
  width: number;
  height: number;
  readiness: Readiness;
}

export async function screenshotPage(opts: ScreenshotOptions): Promise<ScreenshotResult> {
  const w = Math.round(opts.size.w);
  const h = Math.round(opts.size.h);
  const ownsBrowser = !opts.browser;
  let browser: Browser | undefined = opts.browser;
  try {
    browser = browser ?? (await launchChromium());
    const context = await browser.newContext({
      viewport: { width: w, height: h },
      deviceScaleFactor: opts.deviceScaleFactor,
      reducedMotion: "reduce",
      ...(opts.authStateRef ? { storageState: opts.authStateRef } : {}),
    });
    const page = await context.newPage();
    try {
      await page.goto(opts.url, { waitUntil: "load" });
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      if (/ERR_CONNECTION_REFUSED|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ERR_SOCKET/i.test(m)) {
        throw new Error(`could not load ${opts.url} — is the server running?`);
      }
      throw err;
    }

    const fontsReady = await withTimeout(
      page.evaluate(async () => {
        await document.fonts.ready;
        return document.fonts.status === "loaded";
      }),
      5000,
      false
    );
    const imagesComplete = await withTimeout(
      page.evaluate(async () => {
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
      }),
      5000,
      false
    );
    await page.waitForLoadState("networkidle", { timeout: 2000 }).catch(() => {});
    await page.addStyleTag({
      content:
        "*{animation:none!important;transition:none!important;caret-color:transparent!important}",
    });

    await page.screenshot({
      path: opts.outPath,
      clip: { x: 0, y: 0, width: w, height: h },
    });

    return {
      path: opts.outPath,
      width: Math.round(w * opts.deviceScaleFactor),
      height: Math.round(h * opts.deviceScaleFactor),
      readiness: { fontsReady, imagesComplete },
    };
  } finally {
    if (ownsBrowser) await browser?.close();
  }
}

/** Launch a Chromium instance callers can reuse across many screenshots. */
export async function launchBrowser(): Promise<Browser> {
  return launchChromium();
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

async function launchChromium(): Promise<Browser> {
  try {
    return await chromium.launch();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/Executable doesn.?t exist|playwright install|browserType\.launch/i.test(msg)) throw err;
    process.stderr.write("Chromium not found — downloading it once…\n");
    installChromium();
    return chromium.launch();
  }
}

function installChromium(): void {
  const require = createRequire(import.meta.url);
  const cli = join(dirname(require.resolve("playwright-core/package.json")), "cli.js");
  const res = spawnSync(process.execPath, [cli, "install", "chromium"], { stdio: "inherit" });
  if (res.status !== 0) {
    throw new Error("automatic Chromium install failed — run: bunx playwright-core install chromium");
  }
}
