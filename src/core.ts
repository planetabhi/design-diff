import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { PNG } from "pngjs";
import type { Browser } from "playwright-core";
import type { Geometry } from "./types.ts";
import { exportDesignFrame } from "./fetch/figma.ts";
import { screenshotPage, launchBrowser, type Readiness } from "./fetch/dom.ts";
import { comparePixelDiff, type DiffBounds, type IgnoreRegion } from "./compare/pixel.ts";
import { renderOverlayHtml } from "./overlay.ts";
import { writeAnnotatedPng } from "./annotate.ts";

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
  /** Page to screenshot. Provide this or `actual`, not both. */
  url?: string;
  /** Local PNG to compare instead of screenshotting a url. */
  actual?: string;
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
  /** Write heatmap.png (defaults to writeOverlay; forced on when the overlay is written). */
  writeHeatmap?: boolean;
  /** Write annotated.png with the diff box drawn on the page (default false). */
  writeAnnotated?: boolean;
  /** Reuse a shared browser instead of launching one per call. */
  browser?: Browser;
}

export interface DesignDiffResult {
  /** The page URL that was screenshotted, or the `actual` image path in image-vs-image mode. */
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
    annotated?: string;
    metrics: string;
  };
  /** Page load signals; absent in image-vs-image mode. */
  readiness?: Readiness;
}

function isFigmaSource(design: string | FigmaSource): design is FigmaSource {
  return typeof design !== "string";
}

export async function designDiff(opts: DesignDiffOptions): Promise<DesignDiffResult> {
  const scale = opts.scale ?? 1;
  const threshold = opts.threshold ?? 0.1;
  const outDir = opts.outDir ?? ".design-diff";

  if (!opts.url && !opts.actual) throw new Error("provide a url to screenshot or an actual image path");
  if (opts.url && opts.actual) throw new Error("provide either a url or an actual image, not both");
  if (!Number.isFinite(scale) || scale <= 0) throw new Error("scale must be a positive number");
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error("threshold must be between 0 and 1");
  }

  const pngPath = isFigmaSource(opts.design) ? undefined : opts.design;
  if (pngPath && !existsSync(pngPath)) throw new Error(`design not found: ${resolve(pngPath)}`);
  if (opts.actual && !existsSync(opts.actual)) throw new Error(`actual image not found: ${resolve(opts.actual)}`);
  if (opts.auth && !existsSync(opts.auth)) throw new Error(`auth file not found: ${resolve(opts.auth)}`);

  const writeOverlay = opts.writeOverlay ?? true;
  // The overlay embeds the heatmap, so writing the overlay forces it on;
  // otherwise the heatmap follows the overlay unless explicitly requested.
  const writeHeatmap = writeOverlay || (opts.writeHeatmap ?? false);

  const ignoreRects: IgnoreRegion[] = [];
  const ignoreSelectors: string[] = [];
  for (const item of opts.ignore ?? []) {
    if ("selector" in item) ignoreSelectors.push(item.selector);
    else ignoreRects.push(item);
  }
  const waitFor =
    opts.waitFor == null ? [] : Array.isArray(opts.waitFor) ? opts.waitFor : [opts.waitFor];

  if (opts.actual && (waitFor.length || ignoreSelectors.length)) {
    throw new Error("waitFor and ignore selectors require a url, not an actual image");
  }

  const runDir = join(outDir, new Date().toISOString().replace(/[:.]/g, "-"));
  mkdirSync(runDir, { recursive: true });
  const designPng = join(runDir, "design.png");
  const domPng = join(runDir, "dom.png");
  const heatmapPng = join(runDir, "heatmap.png");
  const overlayPath = join(runDir, "overlay.html");
  const annotatedPng = join(runDir, "annotated.png");
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

  let pageWidth: number;
  let pageHeight: number;
  let readiness: Readiness | undefined;
  const resolvedIgnore: IgnoreRegion[] = [...ignoreRects];
  if (opts.actual) {
    copyFileSync(opts.actual, domPng);
    let actualPng: PNG;
    try {
      actualPng = PNG.sync.read(readFileSync(domPng));
    } catch {
      throw new Error(`${opts.actual} is not a readable PNG`);
    }
    pageWidth = actualPng.width;
    pageHeight = actualPng.height;
  } else {
    const shot = await screenshotPage({
      url: opts.url!,
      size: { w: box.w, h: box.h },
      deviceScaleFactor: scale,
      outPath: domPng,
      authStateRef: opts.auth,
      browser: opts.browser,
      waitFor,
      ignoreSelectors,
    });
    pageWidth = shot.width;
    pageHeight = shot.height;
    readiness = shot.readiness;
    resolvedIgnore.push(...shot.ignoreRects);
  }

  // Image mode has no CSS/device relationship, so bounds stay in image pixels.
  const compareScale = opts.actual ? 1 : scale;

  const pixel = comparePixelDiff({
    designPngPath: designPng,
    pagePngPath: domPng,
    heatmapPath: writeHeatmap ? heatmapPng : undefined,
    scale: compareScale,
    threshold,
    ignore: resolvedIgnore,
  });

  let annotatedOut: string | undefined;
  if (opts.writeAnnotated && pixel.bounds) {
    writeAnnotatedPng({
      pagePngPath: domPng,
      outPath: annotatedPng,
      bounds: pixel.bounds,
      scale: compareScale,
    });
    annotatedOut = annotatedPng;
  }

  if (writeOverlay) {
    const diffBoundsPct = pixel.bounds
      ? {
          left: ((pixel.bounds.x * compareScale) / pageWidth) * 100,
          top: ((pixel.bounds.y * compareScale) / pageHeight) * 100,
          width: ((pixel.bounds.width * compareScale) / pageWidth) * 100,
          height: ((pixel.bounds.height * compareScale) / pageHeight) * 100,
        }
      : null;

    writeFileSync(
      overlayPath,
      renderOverlayHtml({
        designSrc: basename(designPng),
        domSrc: basename(domPng),
        heatmapSrc: basename(heatmapPng),
        width: pageWidth,
        height: pageHeight,
        diffPercent: pixel.diffPercent,
        diffBounds: diffBoundsPct,
      })
    );
  }

  const result: DesignDiffResult = {
    url: opts.url ?? opts.actual!,
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
      annotated: annotatedOut,
      metrics: metricsPath,
    },
    readiness,
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
    paths: result.paths,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
