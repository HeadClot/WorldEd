import type { AreaRect } from './area_rect.js';

/** Named corner of a rectangular area. */
export type AreaCornerName = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/** CSS left/top strings for a corner grip inside a pane. */
export interface AreaCornerGripStyle {
  left: string;
  top: string;
}

/**
 * Computes CSS left/top for a corner grip fully inside a pane. Matches the
 * half-gap inset used by area chrome so grips never sit in the separator.
 *
 * @param rect Normalized leaf rect in [0, 1].
 * @param corner Corner of the pane.
 * @param gapPx Separator gap in CSS pixels (full gap between panes).
 * @param gripSizePx Grip hit box size in CSS pixels.
 * @returns Left and top CSS calc strings.
 */
export function computeAreaCornerGripStyle(
  rect: AreaRect,
  corner: AreaCornerName,
  gapPx: number,
  gripSizePx: number,
): AreaCornerGripStyle {
  const halfGap = gapPx / 2;
  const isLeft = corner.includes('left');
  const isTop = corner.includes('top');
  const left = isLeft
    ? `calc(${rect.x * 100}% + ${halfGap}px)`
    : `calc(${(rect.x + rect.width) * 100}% - ${halfGap + gripSizePx}px)`;
  const top = isTop
    ? `calc(${rect.y * 100}% + ${halfGap}px)`
    : `calc(${(rect.y + rect.height) * 100}% - ${halfGap + gripSizePx}px)`;
  return { left, top };
}
