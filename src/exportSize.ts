/** Pixel budget for a PNG so a wide graph is scaled down instead of crashing the canvas. */
export const MAX_EXPORT_EDGE = 8192;
export const MAX_EXPORT_PIXELS = 8_000_000;

export interface ExportSize {
  width: number;
  height: number;
  scale: number;
  /** True when the graph was scaled below its laid-out size. */
  capped: boolean;
}

/**
 * Choose a PNG pixel size for a layout of `layoutWidth` × `layoutHeight`.
 * Prefers 2× when it fits, otherwise 1×, otherwise the largest scale that
 * stays inside the edge and pixel caps.
 */
export function fitExportSize(layoutWidth: number, layoutHeight: number): ExportSize | null {
  if (!Number.isFinite(layoutWidth) || !Number.isFinite(layoutHeight)) return null;
  const width = Math.ceil(layoutWidth);
  const height = Math.ceil(layoutHeight);
  if (width <= 0 || height <= 0) return null;

  const fits = (scale: number) => {
    const w = Math.floor(width * scale);
    const h = Math.floor(height * scale);
    return (
      w <= MAX_EXPORT_EDGE && h <= MAX_EXPORT_EDGE && w * h <= MAX_EXPORT_PIXELS && w >= 1 && h >= 1
    );
  };

  let scale = 2;
  if (!fits(scale)) scale = 1;
  if (!fits(scale)) {
    const edge = Math.min(MAX_EXPORT_EDGE / width, MAX_EXPORT_EDGE / height);
    const pixels = Math.sqrt(MAX_EXPORT_PIXELS / (width * height));
    scale = Math.min(edge, pixels);
  }
  if (!fits(scale)) return null;

  return {
    width: Math.floor(width * scale),
    height: Math.floor(height * scale),
    scale,
    capped: scale < 1,
  };
}
