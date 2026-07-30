import { describe, expect, it, vi } from 'vitest';
import { ViewportPaneLayout } from '@/layout/viewport/viewport_pane_layout.js';
import { ViewportRegistry } from '@/layout/viewport/viewport_registry.js';
import { DEFAULT_AREA_IDS } from '@/layout/area/area_layout_presets.js';
import { ViewportKind } from '@/viewports/core/viewport_kind.js';
import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';
import {
  syncActivePanesFromVisibleLayout,
  toggleMaximizeForPane,
  type LayoutViewportChromeHost,
} from '@/layout/setup/layout_viewport_chrome.js';

/**
 * Builds seed containers for the classic quad area ids.
 *
 * @returns Layer and containers.
 */
function createQuadLayer(): { layer: HTMLElement; containers: HTMLElement[] } {
  const layer = document.createElement('div');
  Object.defineProperty(layer, 'clientWidth', { value: 800, configurable: true });
  Object.defineProperty(layer, 'clientHeight', { value: 600, configurable: true });
  const ids = [DEFAULT_AREA_IDS.top, DEFAULT_AREA_IDS.front, DEFAULT_AREA_IDS.side, DEFAULT_AREA_IDS.perspective];
  const containers = ids.map((areaId) => {
    const element = document.createElement('div');
    element.dataset['areaId'] = areaId;
    layer.appendChild(element);
    return element;
  });
  document.body.appendChild(layer);
  return { layer, containers };
}

/**
 * Creates a viewport stub with maximize toolbar hooks.
 *
 * @param kind Viewport kind.
 * @returns Stub viewport.
 */
function createViewportStub(kind: ViewportKind): ViewportEditor {
  let maximized = false;
  return {
    getViewportKind: () => kind,
    setViewportKind: () => undefined,
    setName: () => undefined,
    dispose: () => undefined,
    getIsDisposed: () => false,
    getViewportToolbar: () => ({
      setOnToggleMaximize: () => undefined,
      setOnViewportKindChange: () => undefined,
      setViewportKind: () => undefined,
      setMaximized: (value: boolean) => {
        maximized = value;
      },
      isMaximized: () => maximized,
    }),
  } as unknown as ViewportEditor;
}

describe('maximize active-pane render filter', () => {
  it('keeps only the maximized pane active so others are not multi-view rendered', () => {
    const { layer, containers } = createQuadLayer();
    const layout = new ViewportPaneLayout(layer, containers);
    layout.apply(4);
    const registry = new ViewportRegistry((kind) => createViewportStub(kind));
    registry.setFactoryDependencies({ inputManager: {} as never, sharedScene: {} as never, surface: {} as never });
    registry.addPaneWithKind(DEFAULT_AREA_IDS.top, containers[0]!, ViewportKind.TOP);
    registry.addPaneWithKind(DEFAULT_AREA_IDS.front, containers[1]!, ViewportKind.FRONT);
    registry.addPaneWithKind(DEFAULT_AREA_IDS.side, containers[2]!, ViewportKind.SIDE);
    registry.addPaneWithKind(DEFAULT_AREA_IDS.perspective, containers[3]!, ViewportKind.PERSPECTIVE);
    const host = {
      viewportRegistry: registry,
      viewportPaneLayout: layout,
      resizeAll: vi.fn(),
    } as unknown as LayoutViewportChromeHost;
    expect(registry.getActiveViewports()).toHaveLength(4);
    toggleMaximizeForPane(host, DEFAULT_AREA_IDS.front);
    expect(registry.getActiveViewports()).toHaveLength(1);
    expect(registry.getActiveViewports()[0]!.getViewportKind()).toBe(ViewportKind.FRONT);
    expect(registry.getAllViewports()).toHaveLength(4);
    expect(layout.getAreaLayoutController().isMaximized()).toBe(true);
    toggleMaximizeForPane(host, DEFAULT_AREA_IDS.front);
    expect(registry.getActiveViewports()).toHaveLength(4);
    expect(layout.getAreaLayoutController().isMaximized()).toBe(false);
    layer.remove();
  });

  it('syncs active panes from visible placements after maximize without toolbar path', () => {
    const { layer, containers } = createQuadLayer();
    const layout = new ViewportPaneLayout(layer, containers);
    layout.apply(4);
    const registry = new ViewportRegistry((kind) => createViewportStub(kind));
    registry.setFactoryDependencies({ inputManager: {} as never, sharedScene: {} as never, surface: {} as never });
    registry.addPaneWithKind(DEFAULT_AREA_IDS.top, containers[0]!, ViewportKind.TOP);
    registry.addPaneWithKind(DEFAULT_AREA_IDS.front, containers[1]!, ViewportKind.FRONT);
    registry.addPaneWithKind(DEFAULT_AREA_IDS.side, containers[2]!, ViewportKind.SIDE);
    registry.addPaneWithKind(DEFAULT_AREA_IDS.perspective, containers[3]!, ViewportKind.PERSPECTIVE);
    layout.getAreaLayoutController().toggleMaximized(DEFAULT_AREA_IDS.perspective);
    const host = {
      viewportRegistry: registry,
      viewportPaneLayout: layout,
    } as unknown as LayoutViewportChromeHost;
    syncActivePanesFromVisibleLayout(host);
    expect(registry.getActiveViewports()).toHaveLength(1);
    expect(registry.getActiveViewports()[0]!.getViewportKind()).toBe(ViewportKind.PERSPECTIVE);
    layer.remove();
  });
});
