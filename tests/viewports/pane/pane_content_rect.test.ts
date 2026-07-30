import { describe, expect, it } from 'vitest';
import {
  cssRectToDeviceRect,
  cssRectToLogicalRect,
  isDrawableRect,
  type PaneCssRect,
} from '@/viewports/pane/pane_content_rect.js';

describe('pane_content_rect', () => {
  it('should convert a top-left CSS rect into lower-left logical pixels', () => {
    const css: PaneCssRect = { left: 0, top: 0, width: 100, height: 50 };
    const logical = cssRectToLogicalRect(css, 200, 100);
    expect(logical.x).toBe(0);
    expect(logical.width).toBe(100);
    expect(logical.height).toBe(50);
    expect(logical.y).toBe(50);
  });

  it('should floor fractional content tops so scissor covers the drawable box', () => {
    // Content sits under the title bar; floor keeps the scissor covering CSS top.
    const css: PaneCssRect = { left: 4, top: 28.6, width: 100, height: 40.2 };
    const logical = cssRectToLogicalRect(css, 400, 200);
    expect(logical.x).toBe(4);
    expect(Math.floor(28.6)).toBe(28);
    expect(logical.y + logical.height).toBe(200 - Math.floor(28.6 + 1e-6));
  });

  it('should produce integer width/height usable for both scissor and camera', () => {
    const css: PaneCssRect = { left: 10.2, top: 20.3, width: 50.4, height: 30.6 };
    const logical = cssRectToLogicalRect(css, 200, 100);
    expect(Number.isInteger(logical.x)).toBe(true);
    expect(Number.isInteger(logical.y)).toBe(true);
    expect(Number.isInteger(logical.width)).toBe(true);
    expect(Number.isInteger(logical.height)).toBe(true);
    expect(logical.width).toBe(Math.ceil(10.2 + 50.4 - 1e-6) - Math.floor(10.2 + 1e-6));
    expect(logical.height).toBe(Math.ceil(20.3 + 30.6 - 1e-6) - Math.floor(20.3 + 1e-6));
  });

  it('should still convert to device pixels when explicitly requested', () => {
    const canvas = {
      width: 400,
      height: 200,
      clientWidth: 200,
      clientHeight: 100,
    } as HTMLCanvasElement;
    const css: PaneCssRect = { left: 10, top: 20, width: 50, height: 25 };
    const device = cssRectToDeviceRect(css, canvas);
    expect(device.x).toBe(20);
    expect(device.width).toBe(100);
    expect(device.height).toBe(50);
    expect(device.y).toBe(200 - 40 - 50);
  });

  it('should reject empty rects', () => {
    expect(isDrawableRect({ x: 0, y: 0, width: 0, height: 10 })).toBe(false);
    expect(isDrawableRect({ x: 0, y: 0, width: 10, height: 10 })).toBe(true);
  });
});
