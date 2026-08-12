import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { reconcileDeviceDims } from "../normalize/scale.ts";

export interface PixelDiffOptions {
  designPngPath: string;
  pagePngPath: string;
  heatmapPath: string;
  scale: number;
  threshold: number;
}

export function comparePixelDiff(opts: PixelDiffOptions): { diffPercent: number } {
  const design = PNG.sync.read(readFileSync(opts.designPngPath));
  const page = PNG.sync.read(readFileSync(opts.pagePngPath));

  const { width, height } = reconcileDeviceDims(design, page, opts.scale);
  const a = cropRGBA(design, width, height);
  const b = cropRGBA(page, width, height);

  const diff = new PNG({ width, height });
  const mismatched = pixelmatch(a, b, diff.data, width, height, {
    threshold: opts.threshold,
    includeAA: false,
  });

  mkdirSync(dirname(opts.heatmapPath), { recursive: true });
  writeFileSync(opts.heatmapPath, PNG.sync.write(diff));

  return { diffPercent: (mismatched / (width * height)) * 100 };
}

function cropRGBA(png: PNG, width: number, height: number): Buffer {
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    png.data.copy(out, y * width * 4, y * png.width * 4, y * png.width * 4 + width * 4);
  }
  return out;
}
