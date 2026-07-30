import { describe, expect, it } from 'vitest';
import { bindFloatingPanelToViewports } from '@/tools/clip_plane/layout/layout_clip_tools_setup.js';
import { resolveFloatingPanelAnchorElement } from '@/ui/floating_panel/panel_floating_viewport_anchor.js';
import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';
import { Viewport2D } from '@/viewports/core/viewport_2d.js';
import { Viewport3D } from '@/viewports/core/viewport_3d.js';

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
): ViewportEditor {
  const container = document.createElement('div');
  document.body.appendChild(container);
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
  return viewport as unknown as ViewportEditor;
}

/**
 * Removes viewport containers created for a test.
 *
 * @param viewports Viewports whose containers should be removed.
 */
function removeViewportContainers(viewports: readonly ViewportEditor[]): void {
  for (const viewport of viewports) {
    viewport.getContainer().remove();
  }
}

describe('bindFloatingPanelToViewports', () => {
  it('installs a resolver that rescans for the largest live perspective', () => {
    const startupPerspective = createViewportMock(true, { left: 0, top: 0, width: 200, height: 200 });
    const remainingPerspective = createViewportMock(true, { left: 300, top: 40, width: 600, height: 400 });
    const ortho = createViewportMock(false, { left: 0, top: 400, width: 300, height: 300 });
    let liveViewports: ViewportEditor[] = [startupPerspective, remainingPerspective, ortho];
    const capture: {
      anchor: HTMLElement | null;
      resolver: (() => HTMLElement | null) | null;
    } = { anchor: null, resolver: null };
    const panel = {
      setDefaultAnchor: (anchor: HTMLElement | null) => {
        capture.anchor = anchor;
      },
      setDefaultAnchorResolver: (resolver: (() => HTMLElement | null) | null) => {
        capture.resolver = resolver;
      },
    };
    bindFloatingPanelToViewports(panel, () => liveViewports);
    expect(capture.anchor).toBe(resolveFloatingPanelAnchorElement(liveViewports));
    expect(capture.resolver).not.toBeNull();
    liveViewports = [remainingPerspective, ortho];
    startupPerspective.getContainer().remove();
    expect(capture.resolver?.()).toBe(remainingPerspective.getContainer());
    removeViewportContainers(liveViewports);
  });
});
