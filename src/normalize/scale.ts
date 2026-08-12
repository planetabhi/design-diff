export const MAX_DIM_DELTA_CSS_PX = 1;

export interface DeviceDim {
  width: number;
  height: number;
}

export function reconcileDeviceDims(a: DeviceDim, b: DeviceDim, scale: number): DeviceDim {
  const dw = Math.abs(a.width - b.width);
  const dh = Math.abs(a.height - b.height);
  const tolDevicePx = Math.ceil(MAX_DIM_DELTA_CSS_PX * scale);
  if (Math.max(dw, dh) > tolDevicePx) {
    throw new Error(
      `design (${a.width}x${a.height}) and page (${b.width}x${b.height}) sizes differ too much — check that --scale matches how the design was exported`
    );
  }
  return { width: Math.min(a.width, b.width), height: Math.min(a.height, b.height) };
}
