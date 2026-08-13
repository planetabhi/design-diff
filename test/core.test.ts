import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { designDiff } from "../src/core.ts";

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
});
