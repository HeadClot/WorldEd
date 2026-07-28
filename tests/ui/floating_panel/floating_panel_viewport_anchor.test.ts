import { describe, it, expect } from 'vitest';
import {
  resolveFloatingPanelAnchorElement,
  resolveFloatingPanelAnchorViewport,
} from '../../../src/ui/floating_panel/floating_panel_viewport_anchor.js';
import type { EditorViewport } from '../../../src/viewports/editor_viewport.js';
import { Viewport2D } from '../../../src/viewports/viewport_2d.js';
import { Viewport3D } from '../../../src/viewports/viewport_3d.js';

/**
 * Builds a viewport mock with a container rect.
 *
 * @param isPerspective Whether the mock is perspective.
 * @param rect Screen rect for the container.
 * @returns Viewport mock.
 */
function createViewportMock(
  isPerspective: boolean,
  rect: { left: number; top: number; width: number; height: number },
): EditorViewport {
  const container = document.createElement('div');
  Object.defineProperty(container, 'getBoundingClientRect', {
    value: () => ({
      left: rect.left,
      top: rect.top,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      width: rect.width,
      height: rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    }),
  });
  const viewport = {
    getContainer: () => container,
  };
  Object.setPrototypeOf(viewport, isPerspective ? Viewport3D.prototype : Viewport2D.prototype);
  return viewport as unknown as EditorViewport;
}

describe('resolveFloatingPanelAnchorViewport', () => {
  it('returns null for an empty viewport list', () => {
    expect(resolveFloatingPanelAnchorViewport([])).toBeNull();
    expect(resolveFloatingPanelAnchorElement([])).toBeNull();
  });

  it('prefers the only perspective viewport', () => {
    const front = createViewportMock(false, { left: 0, top: 0, width: 400, height: 400 });
    const perspective = createViewportMock(true, { left: 400, top: 0, width: 200, height: 200 });
    expect(resolveFloatingPanelAnchorViewport([front, perspective])).toBe(perspective);
  });

  it('picks the largest perspective when several exist', () => {
    const small = createViewportMock(true, { left: 0, top: 0, width: 100, height: 100 });
    const large = createViewportMock(true, { left: 100, top: 0, width: 400, height: 300 });
    expect(resolveFloatingPanelAnchorViewport([small, large])).toBe(large);
  });

  it('falls back to the top-left orthographic viewport when no perspective exists', () => {
    const right = createViewportMock(false, { left: 400, top: 0, width: 200, height: 200 });
    const left = createViewportMock(false, { left: 0, top: 0, width: 200, height: 200 });
    expect(resolveFloatingPanelAnchorViewport([right, left])).toBe(left);
  });
});
