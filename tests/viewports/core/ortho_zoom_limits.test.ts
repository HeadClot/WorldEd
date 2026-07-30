import { describe, it, expect } from 'vitest';
import {
  MIN_ORTHO_HALF_EXTENT,
  MAX_ORTHO_HALF_EXTENT,
  clampOrthoZoomFactor,
  clampOrthoHalfExtent,
  resizeOrthoFrustumPreservingZoom,
  zoomOrthoFrustumTowardPointer,
} from '@/viewports/core/ortho_zoom_limits.js';

describe('ortho_zoom_limits', () => {
  it('should allow zoom factors that stay inside the safe range', () => {
    expect(clampOrthoZoomFactor(5, 1.1)).toBeCloseTo(1.1);
    expect(clampOrthoZoomFactor(5, 0.9)).toBeCloseTo(0.9);
  });

  it('should stop zoom-out at the maximum half-extent', () => {
    const nearMax = MAX_ORTHO_HALF_EXTENT / 1.05;
    const factor = clampOrthoZoomFactor(nearMax, 1.1);
    expect(nearMax * factor).toBeCloseTo(MAX_ORTHO_HALF_EXTENT);
    expect(factor).toBeLessThan(1.1);
  });

  it('should stop zoom-in at the minimum half-extent', () => {
    const nearMin = MIN_ORTHO_HALF_EXTENT * 1.05;
    const factor = clampOrthoZoomFactor(nearMin, 0.9);
    expect(nearMin * factor).toBeCloseTo(MIN_ORTHO_HALF_EXTENT);
    expect(factor).toBeGreaterThan(0.9);
  });

  it('should no-op when already at max zoom-out', () => {
    const factor = clampOrthoZoomFactor(MAX_ORTHO_HALF_EXTENT, 1.1);
    expect(factor).toBeCloseTo(1);
  });

  it('should no-op when already at max zoom-in', () => {
    const factor = clampOrthoZoomFactor(MIN_ORTHO_HALF_EXTENT, 0.9);
    expect(factor).toBeCloseTo(1);
  });

  it('should reject non-finite or non-positive inputs', () => {
    expect(clampOrthoZoomFactor(NaN, 1.1)).toBe(1);
    expect(clampOrthoZoomFactor(5, 0)).toBe(1);
    expect(clampOrthoZoomFactor(5, -2)).toBe(1);
    expect(clampOrthoZoomFactor(0, 1.1)).toBe(1);
  });

  it('should clamp half-extent values into the allowed band', () => {
    expect(clampOrthoHalfExtent(1e12)).toBe(MAX_ORTHO_HALF_EXTENT);
    expect(clampOrthoHalfExtent(1e-9)).toBe(MIN_ORTHO_HALF_EXTENT);
    expect(clampOrthoHalfExtent(12)).toBe(12);
    expect(clampOrthoHalfExtent(NaN)).toBe(MIN_ORTHO_HALF_EXTENT);
  });

  it('should allow very far but finite zoom-out before the hard cap', () => {
    const largeButSafe = 10_000;
    expect(clampOrthoZoomFactor(largeButSafe, 1.1)).toBeCloseTo(1.1);
    expect(largeButSafe * 1.1).toBeLessThan(MAX_ORTHO_HALF_EXTENT);
  });

  it('should preserve zoom half-height when aspect changes after a wheel zoom', () => {
    // After zoom-in, half-height is 2 with center (0,0) and previous aspect 1.
    const zoomed = { left: -2, right: 2, top: 2, bottom: -2 };
    const next = resizeOrthoFrustumPreservingZoom(zoomed, 2, 5);
    expect((next.top - next.bottom) / 2).toBeCloseTo(2);
    expect((next.right - next.left) / 2).toBeCloseTo(4);
    expect((next.left + next.right) / 2).toBeCloseTo(0);
    expect((next.top + next.bottom) / 2).toBeCloseTo(0);
  });

  it('should preserve a non-zero view center while resizing aspect', () => {
    const panned = { left: 8, right: 12, top: 7, bottom: 3 };
    const next = resizeOrthoFrustumPreservingZoom(panned, 1, 5);
    expect((next.top - next.bottom) / 2).toBeCloseTo(2);
    expect((next.left + next.right) / 2).toBeCloseTo(10);
    expect((next.top + next.bottom) / 2).toBeCloseTo(5);
  });

  it('should fall back to the default half-height when the frustum is empty', () => {
    const empty = { left: 0, right: 0, top: 0, bottom: 0 };
    const next = resizeOrthoFrustumPreservingZoom(empty, 1.5, 5);
    expect((next.top - next.bottom) / 2).toBeCloseTo(5);
    expect((next.right - next.left) / 2).toBeCloseTo(7.5);
  });

  it('should keep the projection-space point under the pointer fixed when zooming', () => {
    const current = { left: -10, right: 10, top: 10, bottom: -10 };
    const u = 0.25;
    const v = 0.2;
    const pivotX = current.left + u * (current.right - current.left);
    const pivotY = current.top - v * (current.top - current.bottom);
    const next = zoomOrthoFrustumTowardPointer(current, 0.5, u, v);
    const width = next.right - next.left;
    const height = next.top - next.bottom;
    const mappedX = next.left + u * width;
    const mappedY = next.top - v * height;
    expect(mappedX).toBeCloseTo(pivotX, 8);
    expect(mappedY).toBeCloseTo(pivotY, 8);
    expect(height).toBeCloseTo(10);
  });

  it('should zoom toward a corner without shifting the opposite-side center incorrectly', () => {
    const current = { left: -4, right: 4, top: 4, bottom: -4 };
    const next = zoomOrthoFrustumTowardPointer(current, 0.5, 1, 1);
    // Bottom-right corner (u=1,v=1) maps to (right, bottom) and must stay put.
    expect(next.right).toBeCloseTo(4, 8);
    expect(next.bottom).toBeCloseTo(-4, 8);
    expect(next.left).toBeCloseTo(0, 8);
    expect(next.top).toBeCloseTo(0, 8);
  });
});
