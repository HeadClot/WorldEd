import type { AreaRect } from './area_rect.js';

/** Integer CSS-pixel rectangle for sharp pane chrome and scissor alignment. */
export interface AreaPixelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Converts a normalized [0,1] area rect into integer CSS pixels inside a layer.
 * Shared edges use the same rounded boundary so adjacent panes neither gap nor
 * overlap by a subpixel.
 *
 * @param rect Normalized placement rect.
 * @param layerWidth Layer width in CSS pixels.
 * @param layerHeight Layer height in CSS pixels.
 * @param gapPx Full separator gap between panes in CSS pixels.
 * @returns Integer pixel box inset by half-gap on each side.
 */
export function normalizedRectToPixelRect(
  rect: AreaRect,
  layerWidth: number,
  layerHeight: number,
  gapPx: number,
): AreaPixelRect {
  const surfaceWidth = Math.max(1, Math.floor(layerWidth));
  const surfaceHeight = Math.max(1, Math.floor(layerHeight));
  const x0 = clampInt(Math.round(rect.x * surfaceWidth), 0, surfaceWidth);
  const y0 = clampInt(Math.round(rect.y * surfaceHeight), 0, surfaceHeight);
  const x1 = clampInt(Math.round((rect.x + rect.width) * surfaceWidth), x0, surfaceWidth);
  const y1 = clampInt(Math.round((rect.y + rect.height) * surfaceHeight), y0, surfaceHeight);
  const halfGap = Math.floor(Math.max(0, gapPx) / 2);
  const fullGap = Math.max(0, Math.floor(gapPx));
  const left = x0 + halfGap;
  const top = y0 + halfGap;
  const width = Math.max(0, x1 - x0 - fullGap);
  const height = Math.max(0, y1 - y0 - fullGap);
  return { left, top, width, height };
}

/**
 * Clamps an integer into an inclusive range.
 *
 * @param value Value to clamp.
 * @param min Minimum.
 * @param max Maximum.
 * @returns Clamped integer.
 */
function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
