/**
 * Safe orthographic frustum half-height bounds for 2D viewports. Keeps wheel
 * zoom away from float-precision collapse (too far out) and useless microscopic
 * scales (too far in).
 */
export const MIN_ORTHO_HALF_EXTENT = 0.01;

/**
 * Maximum orthographic half-height (zoom out). Large maps stay visible while
 * left/right/top/bottom stay within stable float range near origin.
 */
export const MAX_ORTHO_HALF_EXTENT = 100_000;

/**
 * Clamps a proposed zoom factor so the resulting half-height stays in range.
 * Factor greater than 1 zooms out; less than 1 zooms in.
 *
 * @param currentHalfHeight Current orthographic half-height (world units).
 * @param proposedFactor Multiplier to apply to the frustum size.
 * @returns Factor that keeps half-height within min/max limits.
 */
export function clampOrthoZoomFactor(currentHalfHeight: number, proposedFactor: number): number {
  if (!isFinite(currentHalfHeight) || currentHalfHeight <= 0) {
    return 1;
  }
  if (!isFinite(proposedFactor) || proposedFactor <= 0) {
    return 1;
  }
  const proposedHalfHeight = currentHalfHeight * proposedFactor;
  if (proposedHalfHeight > MAX_ORTHO_HALF_EXTENT) {
    return MAX_ORTHO_HALF_EXTENT / currentHalfHeight;
  }
  if (proposedHalfHeight < MIN_ORTHO_HALF_EXTENT) {
    return MIN_ORTHO_HALF_EXTENT / currentHalfHeight;
  }
  return proposedFactor;
}

/**
 * Clamps orthographic half-height to the allowed zoom range.
 *
 * @param halfHeight Proposed half-height in world units.
 * @returns Half-height limited to min/max.
 */
export function clampOrthoHalfExtent(halfHeight: number): number {
  if (!isFinite(halfHeight) || halfHeight <= 0) {
    return MIN_ORTHO_HALF_EXTENT;
  }
  if (halfHeight > MAX_ORTHO_HALF_EXTENT) {
    return MAX_ORTHO_HALF_EXTENT;
  }
  if (halfHeight < MIN_ORTHO_HALF_EXTENT) {
    return MIN_ORTHO_HALF_EXTENT;
  }
  return halfHeight;
}

/** Axis-aligned orthographic frustum planes in camera projection space. */
export interface OrthoFrustumPlanes {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Recomputes left/right/top/bottom for a new aspect while keeping the current
 * zoom (half-height) and view center. Multi-view calls resize every frame; this
 * must not reset wheel zoom back to the startup framing.
 *
 * @param current Current frustum planes.
 * @param aspect Width / height of the drawable pane.
 * @param fallbackHalfHeight Half-height used when the current frustum is
 *   invalid.
 * @returns Updated frustum planes.
 */
export function resizeOrthoFrustumPreservingZoom(
  current: OrthoFrustumPlanes,
  aspect: number,
  fallbackHalfHeight: number,
): OrthoFrustumPlanes {
  const safeAspect = isFinite(aspect) && aspect > 1e-6 ? aspect : 1;
  let halfHeight = (current.top - current.bottom) / 2;
  if (!isFinite(halfHeight) || halfHeight <= 0) {
    halfHeight = fallbackHalfHeight;
  }
  halfHeight = clampOrthoHalfExtent(halfHeight);
  const centerX = (current.left + current.right) / 2;
  const centerY = (current.top + current.bottom) / 2;
  const halfWidth = halfHeight * safeAspect;
  return {
    left: centerX - halfWidth,
    right: centerX + halfWidth,
    top: centerY + halfHeight,
    bottom: centerY - halfHeight,
  };
}

/**
 * Zooms an orthographic frustum so the projection-space point under the pointer
 * stays fixed (zoom-to-cursor). Factor greater than 1 zooms out.
 *
 * Pointer coordinates are normalized to the drawable pane: u = 0 at left, 1 at
 * right; v = 0 at top, 1 at bottom (DOM client space).
 *
 * @param current Current frustum planes.
 * @param proposedFactor Multiplier for frustum size before range clamping.
 * @param pointerU Horizontal pointer in [0, 1] across the pane.
 * @param pointerV Vertical pointer in [0, 1] down the pane.
 * @returns Zoomed frustum planes with the pivot held under the pointer.
 */
export function zoomOrthoFrustumTowardPointer(
  current: OrthoFrustumPlanes,
  proposedFactor: number,
  pointerU: number,
  pointerV: number,
): OrthoFrustumPlanes {
  const halfHeight = (current.top - current.bottom) / 2;
  const safeFactor = clampOrthoZoomFactor(halfHeight, proposedFactor);
  if (Math.abs(safeFactor - 1) < 1e-12) {
    return { ...current };
  }
  const u = clamp01(pointerU);
  const v = clamp01(pointerV);
  const width = current.right - current.left;
  const height = current.top - current.bottom;
  const pivotX = current.left + u * width;
  const pivotY = current.top - v * height;
  const centerX = (current.left + current.right) / 2;
  const centerY = (current.top + current.bottom) / 2;
  const halfWidth = (width * safeFactor) / 2;
  const halfHeightAfter = halfHeight * safeFactor;
  const pivotXAfter = centerX + (pivotX - centerX) * safeFactor;
  const pivotYAfter = centerY + (pivotY - centerY) * safeFactor;
  const shiftX = pivotX - pivotXAfter;
  const shiftY = pivotY - pivotYAfter;
  return {
    left: centerX - halfWidth + shiftX,
    right: centerX + halfWidth + shiftX,
    top: centerY + halfHeightAfter + shiftY,
    bottom: centerY - halfHeightAfter + shiftY,
  };
}

/**
 * Clamps a value into the unit interval.
 *
 * @param value Raw number.
 * @returns Value limited to [0, 1], or 0.5 when non-finite.
 */
function clamp01(value: number): number {
  if (!isFinite(value)) return 0.5;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
