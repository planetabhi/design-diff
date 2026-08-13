import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { PNG } from "pngjs";
import type { Browser } from "playwright-core";
import type { Geometry } from "./types.ts";
import { exportDesignFrame } from "./fetch/figma.ts";
import { screenshotPage, launchBrowser, type Readiness } from "./fetch/dom.ts";
import { comparePixelDiff, type DiffBounds, type IgnoreRegion } from "./compare/pixel.ts";
import { renderOverlayHtml } from "./overlay.ts";

export { launchBrowser };
export type { DiffBounds, IgnoreRegion, Readiness };

export interface IgnoreSelector {
  /** CSS selector; every matching element's box is masked. */
  selector: string;
}

export type IgnoreInput = IgnoreRegion | IgnoreSelector;

export interface FigmaSource {
  fileKey: string;
  frameId: string;
}

export interface DesignDiffOptions {
  url: string;
  /** Local PNG path, or a Figma file/frame reference. */
  design: string | FigmaSource;
  scale?: number;
  threshold?: number;
  auth?: string;
  outDir?: string;
  ignore?: IgnoreInput[];
  /** CSS selector(s) to wait for before the screenshot. */
  waitFor?: string | string[];
  /** Write overlay.html (default true). */
  writeOverlay?: boolean;
  /** Write heatmap.png (default true; forced on when the overlay is written). */
  writeHeatmap?: boolean;
  /** Reuse a shared browser instead of launching one per call. */
  browser?: Browser;
}

export interface DesignDiffResult {
  url: string;
  matchPercent: number;
  diffPercent: number;
  changedPixels: number;
  totalPixels: number;
  coveragePercent: number;
  diffBounds: DiffBounds | null;
  paths: {
    design: string;
    page: string;
    heatmap?: string;
    overlay?: string;
    metrics: string;
  };
  readiness: Readiness;
}

function isFigmaSource(design: string | FigmaSource): design is FigmaSource {
  return typeof design !== "string";
}

export async function designDiff(opts: DesignDiffOptions): Promise<DesignDiffResult> {
  const scale = opts.scale ?? 1;
  const threshold = opts.threshold ?? 0.1;
  const outDir = opts.outDir ?? ".design-diff";

  if (!opts.url) throw new Error("missing url");
  if (!Number.isFinite(scale) || scale <= 0) throw new Error("scale must be a positive number");
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error("threshold must be between 0 and 1");
  }

  const pngPath = isFigmaSource(opts.design) ? undefined : opts.design;
  if (pngPath && !existsSync(pngPath)) throw new Error(`design not found: ${resolve(pngPath)}`);
  if (opts.auth && !existsSync(opts.auth)) throw new Error(`auth file not found: ${resolve(opts.auth)}`);

  const writeOverlay = opts.writeOverlay ?? true;
  const writeHeatmap = (opts.writeHeatmap ?? true) || writeOverlay;

  const ignoreRects: IgnoreRegion[] = [];
  const ignoreSelectors: string[] = [];
  for (const item of opts.ignore ?? []) {
    if ("selector" in item) ignoreSelectors.push(item.selector);
    else ignoreRects.push(item);
  }
  const waitFor =
    opts.waitFor == null ? [] : Array.isArray(opts.waitFor) ? opts.waitFor : [opts.waitFor];

  const runDir = join(outDir, new Date().toISOString().replace(/[:.]/g, "-"));
  mkdirSync(runDir, { recursive: true });
  const designPng = join(runDir, "design.png");
  const domPng = join(runDir, "dom.png");
  const heatmapPng = join(runDir, "heatmap.png");
  const overlayPath = join(runDir, "overlay.html");
  const metricsPath = join(runDir, "metrics.json");

  let box: Geometry;
  if (pngPath) {
    let png: PNG;
    try {
      png = PNG.sync.read(readFileSync(pngPath));
    } catch {
      throw new Error(`${pngPath} is not a readable PNG`);
    }
    copyFileSync(pngPath, designPng);
    box = { x: 0, y: 0, w: png.width / scale, h: png.height / scale };
  } else {
    const src = opts.design as FigmaSource;
    ({ box } = await exportDesignFrame(src.fileKey, src.frameId, scale, designPng));
  }

  const shot = await screenshotPage({
    url: opts.url,
    size: { w: box.w, h: box.h },
    deviceScaleFactor: scale,
    outPath: domPng,
    authStateRef: opts.auth,
    browser: opts.browser,
    waitFor,
    ignoreSelectors,
  });

  const pixel = comparePixelDiff({
    designPngPath: designPng,
    pagePngPath: domPng,
    heatmapPath: writeHeatmap ? heatmapPng : undefined,
    scale,
    threshold,
    ignore: [...ignoreRects, ...shot.ignoreRects],
  });

  if (writeOverlay) {
    const diffBoundsPct = pixel.bounds
      ? {
          left: ((pixel.bounds.x * scale) / shot.width) * 100,
          top: ((pixel.bounds.y * scale) / shot.height) * 100,
          width: ((pixel.bounds.width * scale) / shot.width) * 100,
          height: ((pixel.bounds.height * scale) / shot.height) * 100,
        }
      : null;

    writeFileSync(
      overlayPath,
      renderOverlayHtml({
        designSrc: basename(designPng),
        domSrc: basename(domPng),
        heatmapSrc: basename(heatmapPng),
        width: shot.width,
        height: shot.height,
        diffPercent: pixel.diffPercent,
        diffBounds: diffBoundsPct,
      })
    );
  }

  const result: DesignDiffResult = {
    url: opts.url,
    matchPercent: round2(pixel.matchPercent),
    diffPercent: round2(pixel.diffPercent),
    changedPixels: pixel.changedPixels,
    totalPixels: pixel.totalPixels,
    coveragePercent: round2(pixel.coveragePercent),
    diffBounds: pixel.bounds,
    paths: {
      design: designPng,
      page: domPng,
      heatmap: writeHeatmap ? heatmapPng : undefined,
      overlay: writeOverlay ? overlayPath : undefined,
      metrics: metricsPath,
    },
    readiness: shot.readiness,
  };

  writeFileSync(metricsPath, JSON.stringify(metricsOf(result), null, 2));

  return result;
}

/** The machine-readable metrics subset (also the contents of metrics.json). */
export function metricsOf(result: DesignDiffResult) {
  return {
    url: result.url,
    matchPercent: result.matchPercent,
    diffPercent: result.diffPercent,
    changedPixels: result.changedPixels,
    totalPixels: result.totalPixels,
    coveragePercent: result.coveragePercent,
    diffBounds: result.diffBounds,
    readiness: result.readiness,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
