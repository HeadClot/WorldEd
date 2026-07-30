/** Axis-aligned panel position and size in CSS pixels. */
export interface FloatingPanelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Minimum edge padding so panels stay partially visible on screen. */
export const FLOATING_PANEL_SCREEN_PADDING_PX = 8;

/**
 * Clamps a panel rectangle so it stays fully inside the window when possible,
 * or keeps at least the padding inset when the panel is larger than the
 * window.
 *
 * @param rect Proposed panel rectangle.
 * @param viewportWidth Window width in CSS pixels.
 * @param viewportHeight Window height in CSS pixels.
 * @param padding Minimum gap from screen edges.
 * @returns Clamped left/top (width and height unchanged).
 */
export function clampFloatingPanelRectToScreen(
  rect: FloatingPanelRect,
  viewportWidth: number,
  viewportHeight: number,
  padding: number = FLOATING_PANEL_SCREEN_PADDING_PX,
): FloatingPanelRect {
  const safeWidth = Math.max(1, viewportWidth);
  const safeHeight = Math.max(1, viewportHeight);
  const maxLeft = Math.max(padding, safeWidth - rect.width - padding);
  const maxTop = Math.max(padding, safeHeight - rect.height - padding);
  return {
    left: clampNumber(rect.left, padding, maxLeft),
    top: clampNumber(rect.top, padding, maxTop),
    width: rect.width,
    height: rect.height,
  };
}

/**
 * Clamps a scalar into an inclusive range.
 *
 * @param value Input value.
 * @param min Inclusive minimum.
 * @param max Inclusive maximum.
 * @returns Clamped value.
 */
function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
