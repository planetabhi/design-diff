import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { reconcileDeviceDims } from "../normalize/scale.ts";

export interface PixelDiffOptions {
  designPngPath: string;
  pagePngPath: string;
  heatmapPath?: string;
  scale: number;
  threshold: number;
  ignore?: IgnoreRegion[];
}

/** Diff bounding box in CSS pixels. */
export interface DiffBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Rectangle in CSS pixels to exclude from the diff. */
export interface IgnoreRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PixelDiffResult {
  diffPercent: number;
  matchPercent: number;
  changedPixels: number;
  totalPixels: number;
  coveragePercent: number;
  bounds: DiffBounds | null;
}

export function comparePixelDiff(opts: PixelDiffOptions): PixelDiffResult {
  const design = PNG.sync.read(readFileSync(opts.designPngPath));
  const page = PNG.sync.read(readFileSync(opts.pagePngPath));

  const { width, height } = reconcileDeviceDims(design, page, opts.scale);
  const a = cropRGBA(design, width, height);
  const b = cropRGBA(page, width, height);

  if (opts.ignore?.length) maskRegions(a, b, width, height, opts.ignore, opts.scale);

  const diff = new PNG({ width, height });
  const mismatched = pixelmatch(a, b, diff.data, width, height, {
    threshold: opts.threshold,
    includeAA: false,
  });

  if (opts.heatmapPath) {
    mkdirSync(dirname(opts.heatmapPath), { recursive: true });
    writeFileSync(opts.heatmapPath, PNG.sync.write(diff));
  }

  const totalPixels = width * height;
  const bbox = boundsOfChanges(diff.data, width, height);

  let bounds: DiffBounds | null = null;
  let coveragePercent = 0;
  if (bbox) {
    const deviceW = bbox.maxX - bbox.minX + 1;
    const deviceH = bbox.maxY - bbox.minY + 1;
    coveragePercent = ((deviceW * deviceH) / totalPixels) * 100;
    bounds = {
      x: Math.round(bbox.minX / opts.scale),
      y: Math.round(bbox.minY / opts.scale),
      width: Math.round(deviceW / opts.scale),
      height: Math.round(deviceH / opts.scale),
    };
  }

  return {
    diffPercent: (mismatched / totalPixels) * 100,
    matchPercent: (1 - mismatched / totalPixels) * 100,
    changedPixels: mismatched,
    totalPixels,
    coveragePercent,
    bounds,
  };
}

interface RawBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// pixelmatch paints changed pixels solid red; scan for the enclosing box.
function boundsOfChanges(data: Buffer, width: number, height: number): RawBounds | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i] === 255 && data[i + 1] === 0 && data[i + 2] === 0 && data[i + 3] === 255) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { minX, minY, maxX, maxY };
}

function cropRGBA(png: PNG, width: number, height: number): Buffer {
  if (png.width === width && png.height === height) return png.data;
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    png.data.copy(out, y * width * 4, y * png.width * 4, y * png.width * 4 + width * 4);
  }
  return out;
}

// Zero out ignored rectangles in both buffers so pixelmatch can't flag them.
// Regions arrive in CSS pixels; the buffers are device pixels.
function maskRegions(
  a: Buffer,
  b: Buffer,
  width: number,
  height: number,
  regions: IgnoreRegion[],
  scale: number
): void {
  for (const r of regions) {
    const x0 = Math.max(0, Math.round(r.x * scale));
    const y0 = Math.max(0, Math.round(r.y * scale));
    const x1 = Math.min(width, Math.round((r.x + r.width) * scale));
    const y1 = Math.min(height, Math.round((r.y + r.height) * scale));
    for (let y = y0; y < y1; y++) {
      const start = (y * width + x0) * 4;
      const end = (y * width + x1) * 4;
      a.fill(0, start, end);
      b.fill(0, start, end);
    }
  }
}
