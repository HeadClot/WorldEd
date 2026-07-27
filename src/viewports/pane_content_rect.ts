/**
 * Axis-aligned rectangle in logical (CSS) pixels for Three.js setViewport /
 * setScissor. Origin is the lower-left corner of the drawing surface. Three.js
 * multiplies these values by its pixel ratio internally — do not pre-scale by
 * device pixels.
 */
export interface PaneLogicalRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** @deprecated Alias kept for call-site clarity; same as PaneLogicalRect. */
export type PaneDeviceRect = PaneLogicalRect;

/** Axis-aligned rectangle in CSS pixels relative to a reference top-left. */
export interface PaneCssRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Measures an element relative to a reference element in CSS pixels.
 *
 * @param targetElement Element to measure (pane content or container).
 * @param originElement Reference element whose top-left is (0, 0).
 * @returns CSS rect relative to the origin element.
 */
export function measureRelativeCssRect(targetElement: HTMLElement, originElement: HTMLElement): PaneCssRect {
  const target = targetElement.getBoundingClientRect();
  const origin = originElement.getBoundingClientRect();
  return {
    left: target.left - origin.left,
    top: target.top - origin.top,
    width: Math.max(0, target.width),
    height: Math.max(0, target.height),
  };
}

/**
 * Measures a content element relative to a canvas in CSS pixels.
 *
 * @param contentElement Pane content hit target.
 * @param canvas Shared WebGL canvas.
 * @returns CSS rect relative to the canvas.
 */
export function measurePaneCssRect(contentElement: HTMLElement, canvas: HTMLCanvasElement): PaneCssRect {
  return measureRelativeCssRect(contentElement, canvas);
}

/**
 * Converts a top-left CSS pane rect into a lower-left logical rect for
 * Three.js.
 *
 * Snaps to an integer pixel box that fully covers the DOM element (floor min
 * edges, ceil max edges), then clamps to the surface. Width/height of this box
 * must be used for both scissor and camera.aspect so grids stay sharp.
 *
 * @param cssRect CSS rect relative to the surface top-left.
 * @param logicalWidth Surface width from setSize.
 * @param logicalHeight Surface height from setSize.
 * @returns Logical rect with origin at the surface lower-left.
 */
export function cssRectToLogicalRect(
  cssRect: PaneCssRect,
  logicalWidth: number,
  logicalHeight: number,
): PaneLogicalRect {
  const surfaceWidth = Math.max(1, Math.floor(logicalWidth));
  const surfaceHeight = Math.max(1, Math.floor(logicalHeight));
  const x0 = clampInt(Math.floor(cssRect.left + 1e-6), 0, surfaceWidth);
  const y0Top = clampInt(Math.floor(cssRect.top + 1e-6), 0, surfaceHeight);
  const x1 = clampInt(Math.ceil(cssRect.left + cssRect.width - 1e-6), x0, surfaceWidth);
  const y1Top = clampInt(Math.ceil(cssRect.top + cssRect.height - 1e-6), y0Top, surfaceHeight);
  const width = Math.max(0, x1 - x0);
  const height = Math.max(0, y1Top - y0Top);
  const y = surfaceHeight - y1Top;
  return { x: x0, y, width, height };
}

/**
 * Converts a CSS-space pane rect into a drawing-buffer pixel rect.
 *
 * @param cssRect CSS rect relative to the canvas top-left.
 * @param canvas Drawing buffer source (uses width/height and client size).
 * @returns Device-pixel rect with origin at the canvas lower-left.
 */
export function cssRectToDeviceRect(cssRect: PaneCssRect, canvas: HTMLCanvasElement): PaneLogicalRect {
  const clientWidth = Math.max(canvas.clientWidth, 1);
  const clientHeight = Math.max(canvas.clientHeight, 1);
  const scaleX = canvas.width / clientWidth;
  const scaleY = canvas.height / clientHeight;
  const width = Math.max(0, Math.floor(cssRect.width * scaleX));
  const height = Math.max(0, Math.floor(cssRect.height * scaleY));
  const x = Math.floor(cssRect.left * scaleX);
  const topPx = Math.floor(cssRect.top * scaleY);
  const y = canvas.height - topPx - height;
  return { x, y, width, height };
}

/**
 * Measures a pane element as a logical scissor/viewport rect against a surface
 * origin. The returned width/height are the values cameras must use.
 *
 * @param targetElement Pane container (preferred) or content element.
 * @param originElement Canvas element used as the surface origin.
 * @param logicalWidth Renderer logical width from setSize.
 * @param logicalHeight Renderer logical height from setSize.
 * @returns Logical rect for setScissor / setViewport / camera.resize.
 */
export function measurePaneLogicalRectAgainst(
  targetElement: HTMLElement,
  originElement: HTMLElement,
  logicalWidth: number,
  logicalHeight: number,
): PaneLogicalRect {
  return cssRectToLogicalRect(measureRelativeCssRect(targetElement, originElement), logicalWidth, logicalHeight);
}

/**
 * Measures a pane content element as a logical scissor/viewport rect using the
 * canvas client box as origin and size.
 *
 * @param contentElement Pane content hit target.
 * @param canvas Shared WebGL canvas.
 * @returns Logical rect for setScissor / setViewport.
 */
export function measurePaneLogicalRect(contentElement: HTMLElement, canvas: HTMLCanvasElement): PaneLogicalRect {
  const width = Math.max(canvas.clientWidth, 1);
  const height = Math.max(canvas.clientHeight, 1);
  return cssRectToLogicalRect(measurePaneCssRect(contentElement, canvas), width, height);
}

/**
 * @deprecated Use {@link measurePaneLogicalRect}.
 * @param contentElement Pane content hit target.
 * @param canvas Shared WebGL canvas.
 * @returns Logical rect.
 */
export function measurePaneDeviceRect(contentElement: HTMLElement, canvas: HTMLCanvasElement): PaneLogicalRect {
  return measurePaneLogicalRect(contentElement, canvas);
}

/**
 * Returns whether a viewport rect has a positive drawable area.
 *
 * @param rect Logical or device rect to test.
 * @returns True when width and height are both positive.
 */
export function isDrawableRect(rect: PaneLogicalRect): boolean {
  return rect.width > 0 && rect.height > 0;
}

/**
 * @deprecated Use {@link isDrawableRect}.
 * @param rect Rect to test.
 * @returns True when drawable.
 */
export function isDrawableDeviceRect(rect: PaneLogicalRect): boolean {
  return isDrawableRect(rect);
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
