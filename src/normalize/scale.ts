// 2b export scale / clip alignment (plan §2b). Pure, unit-tested without images.

export const MAX_DIM_DELTA_CSS_PX = 1;

export interface DeviceDim {
  width: number;
  height: number;
}

/** Locked equality: Figma export scale must equal Playwright deviceScaleFactor. */
export function assertScaleMatch(exportScale: number, deviceScaleFactor: number): void {
  if (exportScale !== deviceScaleFactor) {
    throw new Error(
      `scale mismatch: figma export scale ${exportScale} != deviceScaleFactor ${deviceScaleFactor}`
    );
  }
}

/**
 * Reconcile two device-px images to a shared clip box: crop ≤1px rounding to the
 * min box; a >1px (in CSS px) difference is a hard error, never a rescale.
 */
export function reconcileDeviceDims(a: DeviceDim, b: DeviceDim, scale: number): DeviceDim {
  const dw = Math.abs(a.width - b.width);
  const dh = Math.abs(a.height - b.height);
  const tolDevicePx = Math.ceil(MAX_DIM_DELTA_CSS_PX * scale);
  if (Math.max(dw, dh) > tolDevicePx) {
    throw new Error(
      `pixel dimension mismatch >${MAX_DIM_DELTA_CSS_PX}px: ${a.width}x${a.height} vs ${b.width}x${b.height}`
    );
  }
  return { width: Math.min(a.width, b.width), height: Math.min(a.height, b.height) };
}
