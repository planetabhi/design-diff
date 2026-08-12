import { describe, expect, test } from "bun:test";
import { assertScaleMatch, reconcileDeviceDims, MAX_DIM_DELTA_CSS_PX } from "../src/normalize/scale.ts";

describe("assertScaleMatch", () => {
  test("equal scales pass", () => {
    expect(() => assertScaleMatch(2, 2)).not.toThrow();
  });
  test("unequal scales throw", () => {
    expect(() => assertScaleMatch(2, 1)).toThrow(/scale mismatch/);
  });
});

describe("reconcileDeviceDims", () => {
  test("identical dims → same box", () => {
    expect(reconcileDeviceDims({ width: 400, height: 96 }, { width: 400, height: 96 }, 2)).toEqual({
      width: 400,
      height: 96,
    });
  });

  test("≤1 CSS px rounding cropped to min box", () => {
    // scale 2 → up to 2 device px difference tolerated.
    expect(reconcileDeviceDims({ width: 400, height: 96 }, { width: 402, height: 95 }, 2)).toEqual({
      width: 400,
      height: 95,
    });
  });

  test(">1 CSS px difference is a hard error", () => {
    expect(() => reconcileDeviceDims({ width: 400, height: 96 }, { width: 410, height: 96 }, 2)).toThrow(
      new RegExp(`>${MAX_DIM_DELTA_CSS_PX}px`)
    );
  });
});
