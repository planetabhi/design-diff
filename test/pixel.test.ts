import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { comparePixelDiff } from "../src/compare/pixel.ts";

const dir = join(".design-diff", "test-pixel");
mkdirSync(dir, { recursive: true });

function solid(w: number, h: number, rgba: [number, number, number, number]): PNG {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) {
    png.data[i * 4] = rgba[0];
    png.data[i * 4 + 1] = rgba[1];
    png.data[i * 4 + 2] = rgba[2];
    png.data[i * 4 + 3] = rgba[3];
  }
  return png;
}

function paintBlock(png: PNG, x0: number, y0: number, x1: number, y1: number, rgba: [number, number, number, number]) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * png.width + x) * 4;
      png.data[i] = rgba[0];
      png.data[i + 1] = rgba[1];
      png.data[i + 2] = rgba[2];
      png.data[i + 3] = rgba[3];
    }
  }
}

const W = 20;
const H = 10;
const white: [number, number, number, number] = [255, 255, 255, 255];
const red: [number, number, number, number] = [255, 0, 0, 255];

const base = solid(W, H, white);
const candidate = solid(W, H, white);
paintBlock(candidate, 0, 0, 4, 4, red);

const basePath = join(dir, "base.png");
const candPath = join(dir, "cand.png");
writeFileSync(basePath, PNG.sync.write(base));
writeFileSync(candPath, PNG.sync.write(candidate));

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("comparePixelDiff", () => {
  test("reports the difference percentage and writes a heatmap", () => {
    const res = comparePixelDiff({
      designPngPath: basePath,
      pagePngPath: candPath,
      heatmapPath: join(dir, "heatmap.png"),
      scale: 2,
      threshold: 0.1,
    });
    expect(res.diffPercent).toBeCloseTo(8, 5);
  });

  test("reports match percent, changed pixels, bounds, and coverage", () => {
    const res = comparePixelDiff({
      designPngPath: basePath,
      pagePngPath: candPath,
      heatmapPath: join(dir, "heatmap2.png"),
      scale: 2,
      threshold: 0.1,
    });
    // 4x4 red block out of 20x10 device px = 16 changed pixels.
    expect(res.changedPixels).toBe(16);
    expect(res.totalPixels).toBe(W * H);
    expect(res.matchPercent).toBeCloseTo(92, 5);
    // Bounds are reported in CSS px (device / scale).
    expect(res.bounds).toEqual({ x: 0, y: 0, width: 2, height: 2 });
    // Bounding box is the 4x4 device block over the 20x10 page.
    expect(res.coveragePercent).toBeCloseTo(8, 5);
  });

  test("identical images report a perfect match and no bounds", () => {
    const res = comparePixelDiff({
      designPngPath: basePath,
      pagePngPath: basePath,
      heatmapPath: join(dir, "heatmap3.png"),
      scale: 1,
      threshold: 0.1,
    });
    expect(res.changedPixels).toBe(0);
    expect(res.matchPercent).toBe(100);
    expect(res.bounds).toBeNull();
    expect(res.coveragePercent).toBe(0);
  });

  test("ignore regions exclude masked pixels from the diff", () => {
    // The 4x4 device block sits at device 0..4, i.e. 0..2 in CSS px at scale 2.
    const res = comparePixelDiff({
      designPngPath: basePath,
      pagePngPath: candPath,
      heatmapPath: join(dir, "heatmap4.png"),
      scale: 2,
      threshold: 0.1,
      ignore: [{ x: 0, y: 0, width: 2, height: 2 }],
    });
    expect(res.changedPixels).toBe(0);
    expect(res.matchPercent).toBe(100);
    expect(res.bounds).toBeNull();
  });
});
