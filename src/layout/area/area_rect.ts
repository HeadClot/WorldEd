/** Axis-aligned rectangle in normalized layout space [0, 1]. */
export interface AreaRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Side of a rectangle used for neighbor and join tests. */
export type AreaEdgeSide = 'left' | 'right' | 'top' | 'bottom';

/** Tolerance for edge-alignment comparisons in normalized space. */
export const AREA_RECT_EPSILON = 1e-6;

/**
 * Creates a full-workspace unit rectangle.
 *
 * @returns Rect covering [0,1] x [0,1].
 */
export function createUnitAreaRect(): AreaRect {
  return { x: 0, y: 0, width: 1, height: 1 };
}

/**
 * Returns whether two numbers are equal within layout epsilon.
 *
 * @param left First value.
 * @param right Second value.
 * @returns True when values match within tolerance.
 */
export function areaNumbersNearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= AREA_RECT_EPSILON;
}

/**
 * Returns the right edge x of a rect.
 *
 * @param rect Source rect.
 * @returns Right edge coordinate.
 */
export function areaRectRight(rect: AreaRect): number {
  return rect.x + rect.width;
}

/**
 * Returns the bottom edge y of a rect.
 *
 * @param rect Source rect.
 * @returns Bottom edge coordinate.
 */
export function areaRectBottom(rect: AreaRect): number {
  return rect.y + rect.height;
}

/**
 * Returns whether two rects share a full vertical edge (left of one = right of
 * other).
 *
 * @param leftRect Candidate left neighbor.
 * @param rightRect Candidate right neighbor.
 * @returns True when they share the full vertical edge.
 */
export function shareFullVerticalEdge(leftRect: AreaRect, rightRect: AreaRect): boolean {
  if (!areaNumbersNearlyEqual(areaRectRight(leftRect), rightRect.x)) return false;
  return areaNumbersNearlyEqual(leftRect.y, rightRect.y) && areaNumbersNearlyEqual(leftRect.height, rightRect.height);
}

/**
 * Returns whether two rects share a full horizontal edge (top of one = bottom
 * of other).
 *
 * @param topRect Candidate upper neighbor.
 * @param bottomRect Candidate lower neighbor.
 * @returns True when they share the full horizontal edge.
 */
export function shareFullHorizontalEdge(topRect: AreaRect, bottomRect: AreaRect): boolean {
  if (!areaNumbersNearlyEqual(areaRectBottom(topRect), bottomRect.y)) return false;
  return areaNumbersNearlyEqual(topRect.x, bottomRect.x) && areaNumbersNearlyEqual(topRect.width, bottomRect.width);
}

/**
 * Returns whether two rects are joinable along a full shared edge.
 *
 * @param first First rect.
 * @param second Second rect.
 * @returns True when either a full vertical or full horizontal edge is shared.
 */
export function areRectsJoinable(first: AreaRect, second: AreaRect): boolean {
  return (
    shareFullVerticalEdge(first, second) ||
    shareFullVerticalEdge(second, first) ||
    shareFullHorizontalEdge(first, second) ||
    shareFullHorizontalEdge(second, first)
  );
}

/**
 * Clamps a value into an inclusive range.
 *
 * @param value Value to clamp.
 * @param min Minimum.
 * @param max Maximum.
 * @returns Clamped value.
 */
export function clampAreaNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
