import { describe, expect, it } from 'vitest';
import { computeAreaCornerGripStyle } from '@/layout/area/area_corner_grip_geometry.js';

describe('computeAreaCornerGripStyle', () => {
  it('should inset grips inside the pane so they do not share the separator center', () => {
    const leftPane = { x: 0, y: 0, width: 0.5, height: 0.5 };
    const rightPane = { x: 0.5, y: 0, width: 0.5, height: 0.5 };
    const gapPx = 4;
    const gripSizePx = 12;
    const leftTopRight = computeAreaCornerGripStyle(leftPane, 'top-right', gapPx, gripSizePx);
    const rightTopLeft = computeAreaCornerGripStyle(rightPane, 'top-left', gapPx, gripSizePx);
    // Left pane's right grip ends before the mid separator; right pane's left grip starts after it.
    expect(leftTopRight.left).toBe('calc(50% - 14px)');
    expect(rightTopLeft.left).toBe('calc(50% + 2px)');
    expect(leftTopRight.top).toBe('calc(0% + 2px)');
    expect(rightTopLeft.top).toBe('calc(0% + 2px)');
  });

  it('should place bottom-left grips inside the lower edge of the source pane', () => {
    const rect = { x: 0, y: 0.5, width: 0.5, height: 0.5 };
    const style = computeAreaCornerGripStyle(rect, 'bottom-left', 4, 12);
    expect(style.left).toBe('calc(0% + 2px)');
    expect(style.top).toBe('calc(100% - 14px)');
  });
});
