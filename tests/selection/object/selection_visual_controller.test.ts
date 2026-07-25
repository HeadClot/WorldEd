import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { SelectionVisualController } from '../../../src/selection/object/selection_visual_controller.js';
import { SelectionManager } from '../../../src/selection/object/selection_manager.js';
import { ViewportSyncManager } from '../../../src/managers/layout/viewport_sync_manager.js';
import { SELECTION_HIGHLIGHT_USERDATA_KEY } from '../../../src/selection/object/selection_highlight.js';
import { SolidBrushVisual } from '../../../src/solid/model/solid_brush_visual.js';
import { SolidOperation } from '../../../src/solid/types/solid_operation.js';

/** Minimal viewport stand-in with a scene for selection outline tests. */
class MockViewport {
  private scene: THREE.Scene;
  private selectionManager: SelectionManager | null;

  constructor() {
    this.scene = new THREE.Scene();
    this.selectionManager = null;
  }

  getScene(): THREE.Scene {
    return this.scene;
  }

  setSelectionManager(manager: SelectionManager): void {
    this.selectionManager = manager;
  }

  setSelectionHighlight(_highlight: unknown): void {}

  getSelectionManager(): SelectionManager | null {
    return this.selectionManager;
  }
}

/**
 * Builds a viewport sync stub that reports world meshes for hull fill sync.
 *
 * @param worldMeshes Authoritative selectable meshes.
 * @returns Partial ViewportSyncManager used by the controller.
 */
function createSyncManagerStub(worldMeshes: THREE.Mesh[]): ViewportSyncManager {
  return {
    findCloneMeshesForWorldUuid: () => [],
    getWorldSelectableMeshes: () => worldMeshes.slice(),
  } as unknown as ViewportSyncManager;
}

describe('SelectionVisualController', () => {
  let selectionManager: SelectionManager;
  let world: THREE.Group;
  let mesh: THREE.Mesh;
  let viewport3d: MockViewport;
  let viewport2d: MockViewport;
  let syncManager: ViewportSyncManager;
  let controller: SelectionVisualController;

  beforeEach(() => {
    selectionManager = new SelectionManager();
    world = new THREE.Group();
    mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.name = 'Box';
    world.add(mesh);
    viewport3d = new MockViewport();
    viewport2d = new MockViewport();
    viewport3d.getScene().add(world);
    syncManager = createSyncManagerStub([mesh]);
    controller = new SelectionVisualController(selectionManager, syncManager);
    controller.wireViewports([viewport3d as any, viewport2d as any]);
  });

  it('should apply selection outline to the world mesh on selection', () => {
    selectionManager.selectObject(mesh);
    const hasOutline = mesh.children.some((child) => child.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] === true);
    expect(hasOutline).toBe(true);
  });

  it('should keep outline as a child after transform sync', () => {
    selectionManager.selectObject(mesh);
    mesh.position.set(3, 4, 5);
    controller.syncDuringTransform();
    const outline = mesh.children.find(
      (child) => child.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] === true,
    ) as THREE.Object3D;
    expect(outline.parent).toBe(mesh);
    expect(outline.position.x).toBe(0);
  });

  it('should reapply outlines after viewport clone rebuild', () => {
    selectionManager.selectObject(mesh);
    controller.reapplyAfterViewportSync();
    const hasOutline = mesh.children.some((child) => child.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] === true);
    expect(hasOutline).toBe(true);
  });

  it('should clear outlines when selection is cleared', () => {
    selectionManager.selectObject(mesh);
    selectionManager.clearSelection();
    const hasOutline = mesh.children.some((child) => child.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] === true);
    expect(hasOutline).toBe(false);
  });

  it('should show solid brush hull fill only while the brush is selected', () => {
    const brushMesh = SolidBrushVisual.createBoxPreview('Brush', 2, SolidOperation.Subtractive);
    world.add(brushMesh);
    syncManager = createSyncManagerStub([mesh, brushMesh]);
    controller = new SelectionVisualController(selectionManager, syncManager);
    controller.wireViewports([viewport3d as any, viewport2d as any]);
    expect(SolidBrushVisual.isHullFillVisible(brushMesh)).toBe(false);
    selectionManager.selectObject(brushMesh);
    expect(SolidBrushVisual.isHullFillVisible(brushMesh)).toBe(true);
    const fillMaterial = brushMesh.material as THREE.MeshBasicMaterial;
    expect(fillMaterial.colorWrite).toBe(true);
    expect(fillMaterial.color.getHex()).toBe(0xc0392b);
    selectionManager.clearSelection();
    expect(SolidBrushVisual.isHullFillVisible(brushMesh)).toBe(false);
    expect((brushMesh.material as THREE.MeshBasicMaterial).colorWrite).toBe(false);
  });
});
