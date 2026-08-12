import { describe, expect, test } from "bun:test";
import { reconcileDeviceDims } from "../src/normalize/scale.ts";

describe("reconcileDeviceDims", () => {
  test("identical dims → same box", () => {
    expect(reconcileDeviceDims({ width: 400, height: 96 }, { width: 400, height: 96 }, 2)).toEqual({
      width: 400,
      height: 96,
    });
  });

  test("≤1 CSS px rounding cropped to min box", () => {
    expect(reconcileDeviceDims({ width: 400, height: 96 }, { width: 402, height: 95 }, 2)).toEqual({
      width: 400,
      height: 95,
    });
  });

  test("a bigger difference is a hard error", () => {
    expect(() => reconcileDeviceDims({ width: 400, height: 96 }, { width: 410, height: 96 }, 2)).toThrow(
      /differ too much/
    );
  });
});
