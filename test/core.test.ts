import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { designDiff, metricsOf } from "../src/core.ts";

const dir = join(".design-diff", "test-core");
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

const white: [number, number, number, number] = [255, 255, 255, 255];
const red: [number, number, number, number] = [255, 0, 0, 255];

const design = solid(20, 10, white);
const same = solid(20, 10, white);
const changed = solid(20, 10, white);
for (let y = 0; y < 4; y++) {
  for (let x = 0; x < 4; x++) {
    const i = (y * 20 + x) * 4;
    changed.data[i] = red[0];
    changed.data[i + 1] = red[1];
    changed.data[i + 2] = red[2];
    changed.data[i + 3] = red[3];
  }
}

const designPath = join(dir, "design.png");
const samePath = join(dir, "same.png");
const changedPath = join(dir, "changed.png");
writeFileSync(designPath, PNG.sync.write(design));
writeFileSync(samePath, PNG.sync.write(same));
writeFileSync(changedPath, PNG.sync.write(changed));

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("designDiff image-vs-image mode", () => {
  test("identical images report a perfect match with no browser", async () => {
    const res = await designDiff({
      actual: samePath,
      design: designPath,
      outDir: dir,
      writeOverlay: false,
      writeHeatmap: false,
    });
    expect(res.matchPercent).toBe(100);
    expect(res.changedPixels).toBe(0);
    expect(res.diffBounds).toBeNull();
    // No page, so no readiness signals.
    expect(res.readiness).toBeUndefined();
    expect(res.paths.overlay).toBeUndefined();
  });

  test("reports bounds in image pixels regardless of scale", async () => {
    const res = await designDiff({
      actual: changedPath,
      design: designPath,
      scale: 2,
      outDir: dir,
      writeOverlay: false,
      writeHeatmap: false,
    });
    expect(res.changedPixels).toBe(16);
    // scale is ignored in image mode: the 4x4 block stays 4x4.
    expect(res.diffBounds).toEqual({ x: 0, y: 0, width: 4, height: 4 });
  });

  test("rejects passing both url and actual", async () => {
    await expect(
      designDiff({ url: "http://x", actual: samePath, design: designPath, outDir: dir })
    ).rejects.toThrow(/either a url or an actual/);
  });

  test("writes an annotated png only when a diff exists", async () => {
    const withDiff = await designDiff({
      actual: changedPath,
      design: designPath,
      outDir: dir,
      writeOverlay: false,
      writeHeatmap: false,
      writeAnnotated: true,
    });
    expect(withDiff.paths.annotated).toBeDefined();
    const annotated = PNG.sync.read(readFileSync(withDiff.paths.annotated!));
    // Same dimensions as the page it annotates.
    expect(annotated.width).toBe(20);
    expect(annotated.height).toBe(10);
    // The box border is painted amber somewhere.
    let sawBorder = false;
    for (let i = 0; i < annotated.data.length; i += 4) {
      if (annotated.data[i] === 255 && annotated.data[i + 1] === 179 && annotated.data[i + 2] === 0) {
        sawBorder = true;
        break;
      }
    }
    expect(sawBorder).toBe(true);

    const noDiff = await designDiff({
      actual: samePath,
      design: designPath,
      outDir: dir,
      writeOverlay: false,
      writeHeatmap: false,
      writeAnnotated: true,
    });
    expect(noDiff.paths.annotated).toBeUndefined();
  });

  test("writeOverlay:false suppresses both overlay.html and heatmap.png", async () => {
    const res = await designDiff({
      actual: changedPath,
      design: designPath,
      outDir: dir,
      writeOverlay: false,
    });
    expect(res.paths.overlay).toBeUndefined();
    expect(res.paths.heatmap).toBeUndefined();
  });

  test("heatmap is written by default alongside the overlay", async () => {
    const res = await designDiff({
      actual: changedPath,
      design: designPath,
      outDir: dir,
    });
    expect(res.paths.overlay).toBeDefined();
    expect(res.paths.heatmap).toBeDefined();
    expect(existsSync(res.paths.heatmap!)).toBe(true);
  });

  test("metrics include the artifact paths for scripting", async () => {
    const res = await designDiff({
      actual: changedPath,
      design: designPath,
      outDir: dir,
      writeOverlay: false,
    });
    const metrics = metricsOf(res);
    expect(metrics.paths).toEqual(res.paths);
    expect(metrics.paths.metrics).toContain("metrics.json");
  });
});
