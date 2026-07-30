import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ControllerAreaLayout } from '@/layout/area/controller_area_layout.js';
import { createDualTopPerspectiveLayout } from '@/layout/area/area_layout_presets.js';
import { listAreaLeafPlacements } from '@/layout/area/area_layout_tree.js';
import { ControllerWorkspace } from '@/layout/workspace/controller_workspace.js';
import { WorkspaceStore } from '@/layout/workspace/workspace_store.js';
import { WORKSPACE_IDS } from '@/layout/workspace/workspace_definition.js';
import { ViewportRegistry } from '@/layout/viewport/viewport_registry.js';
import { ViewportKind } from '@/viewports/core/viewport_kind.js';
import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';

/** In-memory Storage for isolation. */
function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

/**
 * Creates a lightweight viewport mock for registry tests.
 *
 * @param kind Initial viewport kind.
 * @returns Viewport stub.
 */
/**
 * Creates a lightweight viewport mock for registry tests.
 *
 * @param kind Initial viewport kind.
 * @param camera Optional camera used for workspace camera persistence tests.
 * @returns Viewport stub.
 */
function createMockViewport(kind: ViewportKind, camera?: THREE.Camera): ViewportEditor {
  let assignedKind = kind;
  const resolvedCamera =
    camera ??
    (kind === ViewportKind.PERSPECTIVE
      ? new THREE.PerspectiveCamera(60, 1, 0.1, 1000)
      : new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 1000));
  return {
    getViewportKind: () => assignedKind,
    setViewportKind: (next: ViewportKind) => {
      assignedKind = next;
    },
    getCamera: () => resolvedCamera,
    syncFlyingCameraOrientation: () => undefined,
    setName: () => undefined,
    dispose: () => undefined,
    getIsDisposed: () => false,
  } as unknown as ViewportEditor;
}

/**
 * Builds a dual-pane area controller with a real DOM layer.
 *
 * @returns Controller and layer element.
 */
function createDualAreaController(): { controller: ControllerAreaLayout; layer: HTMLElement } {
  const layer = document.createElement('div');
  Object.defineProperty(layer, 'clientWidth', { value: 800, configurable: true });
  Object.defineProperty(layer, 'clientHeight', { value: 600, configurable: true });
  document.body.appendChild(layer);
  const controller = new ControllerAreaLayout(layer, createDualTopPerspectiveLayout());
  controller.apply({ pruneMissing: true });
  return { controller, layer };
}

describe('WorkspaceController layout persistence', () => {
  it('persists viewport kind into the active workspace when the tree is updated', () => {
    const storage = createMemoryStorage();
    const store = new WorkspaceStore(storage);
    store.setActiveWorkspaceId(WORKSPACE_IDS.dual);
    const { controller: areaController, layer } = createDualAreaController();
    const registry = new ViewportRegistry((kind) => createMockViewport(kind));
    const host = {
      onAreaAdded: vi.fn(),
      onAreaRemoved: vi.fn(),
      onAreaKindChanged: vi.fn(),
      onStructureChanged: vi.fn(),
    };
    const workspace = new ControllerWorkspace(store, areaController, registry, host);
    workspace.applyActiveWorkspace();
    const topPlacement = listAreaLeafPlacements(areaController.getRoot()).find(
      (item) => item.payload.viewportKind === ViewportKind.TOP,
    );
    expect(topPlacement).toBeDefined();
    expect(areaController.setViewportKind(topPlacement!.payload.areaId, ViewportKind.FRONT)).toBe(true);
    workspace.persistCurrentIntoActive();
    const saved = store.getActiveWorkspace();
    expect(saved).not.toBeNull();
    const reloaded = new WorkspaceStore(storage);
    reloaded.setActiveWorkspaceId(WORKSPACE_IDS.dual);
    const area2 = new ControllerAreaLayout(layer, createDualTopPerspectiveLayout());
    const registry2 = new ViewportRegistry((kind) => createMockViewport(kind));
    const host2 = {
      onAreaAdded: vi.fn((areaId: string, _container: HTMLElement, kind: ViewportKind) => {
        registry2.addPaneWithKind(areaId, document.createElement('div'), kind);
      }),
      onAreaRemoved: vi.fn(),
      onAreaKindChanged: vi.fn((areaId: string, kind: ViewportKind) => {
        registry2.replaceKind(areaId, kind);
      }),
      onStructureChanged: vi.fn(),
    };
    const workspace2 = new ControllerWorkspace(reloaded, area2, registry2, host2);
    workspace2.applyActiveWorkspace();
    const kinds = listAreaLeafPlacements(area2.getRoot()).map((item) => item.payload.viewportKind);
    expect(kinds).toContain(ViewportKind.FRONT);
    expect(kinds).not.toContain(ViewportKind.TOP);
    layer.remove();
  });

  it('invokes onAreaKindChanged when applying a layout with a different kind for an existing pane', () => {
    const store = new WorkspaceStore(createMemoryStorage());
    store.setActiveWorkspaceId(WORKSPACE_IDS.dual);
    const { controller: areaController, layer } = createDualAreaController();
    const registry = new ViewportRegistry((kind) => createMockViewport(kind));
    registry.setFactoryDependencies({ inputManager: {} as never, sharedScene: {} as never, surface: {} as never });
    const onAreaKindChanged = vi.fn();
    const host = {
      onAreaAdded: (areaId: string, container: HTMLElement, kind: ViewportKind) => {
        registry.addPaneWithKind(areaId, container, kind);
      },
      onAreaRemoved: (areaId: string) => {
        registry.removePane(areaId);
      },
      onAreaKindChanged,
      onStructureChanged: vi.fn(),
    };
    const workspace = new ControllerWorkspace(store, areaController, registry, host);
    workspace.applyActiveWorkspace();
    const topAreaId = registry
      .getPanes()
      .find((pane) => pane.getKind() === ViewportKind.TOP)
      ?.getId();
    expect(topAreaId).toBeDefined();
    expect(registry.getPaneById(topAreaId!)?.getViewport()).toBeTruthy();
    areaController.setViewportKind(topAreaId!, ViewportKind.SIDE);
    store.updateWorkspaceLayout(WORKSPACE_IDS.dual, areaController.serialize());
    areaController.setViewportKind(topAreaId!, ViewportKind.TOP);
    registry.replaceKind(topAreaId!, ViewportKind.TOP);
    workspace.applyActiveWorkspace();
    expect(onAreaKindChanged).toHaveBeenCalledWith(topAreaId, ViewportKind.SIDE);
    layer.remove();
  });

  it('remembers 2D and 3D camera poses when switching workspaces', () => {
    const storage = createMemoryStorage();
    const store = new WorkspaceStore(storage);
    store.setActiveWorkspaceId(WORKSPACE_IDS.dual);
    const { controller: areaController, layer } = createDualAreaController();
    const cameras = new Map<string, THREE.Camera>();
    const registry = new ViewportRegistry((kind) => {
      const camera =
        kind === ViewportKind.PERSPECTIVE
          ? new THREE.PerspectiveCamera(60, 1, 0.1, 1000)
          : new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 1000);
      return createMockViewport(kind, camera);
    });
    registry.setFactoryDependencies({ inputManager: {} as never, sharedScene: {} as never, surface: {} as never });
    const host = {
      onAreaAdded: (areaId: string, container: HTMLElement, kind: ViewportKind) => {
        registry.addPaneWithKind(areaId, container, kind);
        const viewport = registry.getPaneById(areaId)?.getViewport();
        if (viewport) cameras.set(areaId, viewport.getCamera());
      },
      onAreaRemoved: (areaId: string) => {
        registry.removePane(areaId);
        cameras.delete(areaId);
      },
      onAreaKindChanged: (areaId: string, kind: ViewportKind) => {
        registry.replaceKind(areaId, kind);
        const viewport = registry.getPaneById(areaId)?.getViewport();
        if (viewport) cameras.set(areaId, viewport.getCamera());
      },
      onStructureChanged: vi.fn(),
    };
    const workspace = new ControllerWorkspace(store, areaController, registry, host);
    workspace.applyActiveWorkspace({ restoreCameras: false });
    const perspectivePane = registry.getPanes().find((pane) => pane.getKind() === ViewportKind.PERSPECTIVE);
    const topPane = registry.getPanes().find((pane) => pane.getKind() === ViewportKind.TOP);
    expect(perspectivePane && topPane).toBeTruthy();
    const perspectiveCamera = perspectivePane!.getViewport()!.getCamera() as THREE.PerspectiveCamera;
    const topCamera = topPane!.getViewport()!.getCamera() as THREE.OrthographicCamera;
    perspectiveCamera.position.set(11, 7, 13);
    perspectiveCamera.quaternion.setFromEuler(new THREE.Euler(0.1, 0.5, 0));
    topCamera.position.set(2, 30, -1);
    topCamera.left = -6;
    topCamera.right = 6;
    topCamera.top = 4;
    topCamera.bottom = -4;
    workspace.persistCurrentIntoActive();
    workspace.switchTo(WORKSPACE_IDS.quad);
    workspace.switchTo(WORKSPACE_IDS.dual);
    const restoredPerspective = registry
      .getPanes()
      .find((pane) => pane.getKind() === ViewportKind.PERSPECTIVE)
      ?.getViewport()
      ?.getCamera() as THREE.PerspectiveCamera;
    const restoredTop = registry
      .getPanes()
      .find((pane) => pane.getKind() === ViewportKind.TOP)
      ?.getViewport()
      ?.getCamera() as THREE.OrthographicCamera;
    expect(restoredPerspective.position.x).toBeCloseTo(11);
    expect(restoredPerspective.position.y).toBeCloseTo(7);
    expect(restoredPerspective.position.z).toBeCloseTo(13);
    expect(restoredTop.left).toBe(-6);
    expect(restoredTop.right).toBe(6);
    expect(restoredTop.position.y).toBeCloseTo(30);
    layer.remove();
  });

  it('does not restore saved cameras on startup-style apply', () => {
    const storage = createMemoryStorage();
    const store = new WorkspaceStore(storage);
    store.setActiveWorkspaceId(WORKSPACE_IDS.dual);
    const { controller: areaController, layer } = createDualAreaController();
    const registry = new ViewportRegistry((kind) => {
      const camera =
        kind === ViewportKind.PERSPECTIVE
          ? new THREE.PerspectiveCamera(60, 1, 0.1, 1000)
          : new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 1000);
      return createMockViewport(kind, camera);
    });
    registry.setFactoryDependencies({ inputManager: {} as never, sharedScene: {} as never, surface: {} as never });
    const host = {
      onAreaAdded: (areaId: string, container: HTMLElement, kind: ViewportKind) => {
        registry.addPaneWithKind(areaId, container, kind);
      },
      onAreaRemoved: (areaId: string) => {
        registry.removePane(areaId);
      },
      onAreaKindChanged: (areaId: string, kind: ViewportKind) => {
        registry.replaceKind(areaId, kind);
      },
      onStructureChanged: vi.fn(),
    };
    const workspace = new ControllerWorkspace(store, areaController, registry, host);
    workspace.applyActiveWorkspace({ restoreCameras: false });
    const perspectivePane = registry.getPanes().find((pane) => pane.getKind() === ViewportKind.PERSPECTIVE)!;
    const camera = perspectivePane.getViewport()!.getCamera() as THREE.PerspectiveCamera;
    const defaultX = camera.position.x;
    camera.position.set(99, 88, 77);
    workspace.persistCurrentIntoActive();
    camera.position.set(defaultX, 0, 0);
    workspace.applyActiveWorkspace({ restoreCameras: false });
    const afterStartup = registry
      .getPanes()
      .find((pane) => pane.getKind() === ViewportKind.PERSPECTIVE)!
      .getViewport()!
      .getCamera() as THREE.PerspectiveCamera;
    expect(afterStartup.position.x).not.toBeCloseTo(99);
    layer.remove();
  });
});
