import { describe, expect, it } from 'vitest';
import { normalizedRectToPixelRect } from '@/layout/area/area_pixel_rect.js';

describe('normalizedRectToPixelRect', () => {
  it('should produce integer pixel boxes that share rounded edges', () => {
    const layerWidth = 1001;
    const layerHeight = 800;
    const left = normalizedRectToPixelRect({ x: 0, y: 0, width: 0.5, height: 1 }, layerWidth, layerHeight, 0);
    const right = normalizedRectToPixelRect({ x: 0.5, y: 0, width: 0.5, height: 1 }, layerWidth, layerHeight, 0);
    expect(Number.isInteger(left.left)).toBe(true);
    expect(Number.isInteger(left.width)).toBe(true);
    expect(Number.isInteger(right.left)).toBe(true);
    expect(left.left + left.width).toBe(right.left);
    expect(left.width + right.width).toBe(layerWidth);
  });

  it('should inset by integer half-gaps without fractional CSS', () => {
    const rect = normalizedRectToPixelRect({ x: 0, y: 0, width: 1, height: 1 }, 200, 100, 4);
    expect(rect.left).toBe(2);
    expect(rect.top).toBe(2);
    expect(rect.width).toBe(196);
    expect(rect.height).toBe(96);
  });
});
