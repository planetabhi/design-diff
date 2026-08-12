// compare_pixel_diff (plan §3c) — advisory pixelmatch over two PNGs. Never pass/fail.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import type { IgnoreRegion } from "../types.ts";
import { reconcileDeviceDims } from "../normalize/scale.ts";

export interface PixelDiffOptions {
  figmaPngPath: string;
  domPngPath: string;
  heatmapPath: string;
  scale: number;
  clip: { w: number; h: number };
  aaThreshold: number; // 0–1
  ignoreRegions: IgnoreRegion[]; // anchor-relative CSS px
}

export interface PixelDiffResult {
  diffPercent: number;
  heatmapPngRef: string;
  inputs: {
    scale: number;
    clip: { w: number; h: number };
    aaThreshold: number;
    ignoreRegions: IgnoreRegion[];
  };
}

/** Mask ignore regions (scaled to device px) by zeroing both images' pixels. */
function maskRegions(
  a: Buffer,
  b: Buffer,
  width: number,
  height: number,
  scale: number,
  regions: IgnoreRegion[]
): void {
  for (const { geometry } of regions) {
    const x0 = Math.max(0, Math.floor(geometry.x * scale));
    const y0 = Math.max(0, Math.floor(geometry.y * scale));
    const x1 = Math.min(width, Math.ceil((geometry.x + geometry.w) * scale));
    const y1 = Math.min(height, Math.ceil((geometry.y + geometry.h) * scale));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * 4;
        a[i] = a[i + 1] = a[i + 2] = a[i + 3] = 0;
        b[i] = b[i + 1] = b[i + 2] = b[i + 3] = 0;
      }
    }
  }
}

export function comparePixelDiff(opts: PixelDiffOptions): PixelDiffResult {
  const figma = PNG.sync.read(readFileSync(opts.figmaPngPath));
  const dom = PNG.sync.read(readFileSync(opts.domPngPath));

  // Crop both to the shared min box (≤1px rounding); >1px is a hard error (2b).
  const { width, height } = reconcileDeviceDims(figma, dom, opts.scale);
  const a = cropRGBA(figma, width, height);
  const b = cropRGBA(dom, width, height);

  maskRegions(a, b, width, height, opts.scale, opts.ignoreRegions);

  const diff = new PNG({ width, height });
  const mismatched = pixelmatch(a, b, diff.data, width, height, {
    threshold: opts.aaThreshold,
    includeAA: false,
  });

  mkdirSync(dirname(opts.heatmapPath), { recursive: true });
  writeFileSync(opts.heatmapPath, PNG.sync.write(diff));

  return {
    diffPercent: (mismatched / (width * height)) * 100,
    heatmapPngRef: opts.heatmapPath,
    inputs: {
      scale: opts.scale,
      clip: opts.clip,
      aaThreshold: opts.aaThreshold,
      ignoreRegions: opts.ignoreRegions,
    },
  };
}

function cropRGBA(png: PNG, width: number, height: number): Buffer {
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    png.data.copy(out, y * width * 4, y * png.width * 4, y * png.width * 4 + width * 4);
  }
  return out;
}
