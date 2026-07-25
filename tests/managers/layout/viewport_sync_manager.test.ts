import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { ViewportSyncManager } from '../../../src/managers/layout/viewport_sync_manager.js';
import { Viewport2D } from '../../../src/viewports/viewport_2d.js';
import { Viewport3D } from '../../../src/viewports/viewport_3d.js';
import { SolidBrushVisual } from '../../../src/solid/model/solid_brush_visual.js';
import { SolidOperation } from '../../../src/solid/types/solid_operation.js';
import { SOLID_BRUSH_EDGE_USERDATA_KEY } from '../../../src/solid/model/solid_brush_edge_materials.js';

/**
 * Creates a minimal Viewport2D mock with the methods required by
 * ViewportSyncManager.
 *
 * @param scene The scene to associate with this viewport mock.
 * @returns A partial Viewport2D instance.
 */
function createViewport2DMock(scene: THREE.Scene): Viewport2D {
  return {
    getScene: () => scene,
    setSelectableObjects: vi.fn(),
  } as unknown as Viewport2D;
}

/**
 * Creates a minimal Viewport3D mock with the methods required by
 * ViewportSyncManager.
 *
 * @param scene The scene to associate with this viewport mock.
 * @returns A partial Viewport3D instance.
 */
function createViewport3DMock(scene: THREE.Scene): Viewport3D {
  return {
    getScene: () => scene,
    setSelectableObjects: vi.fn(),
  } as unknown as Viewport3D;
}

/**
 * Creates a world group with test child meshes at specified positions.
 *
 * @param positions Array of position tuples for child meshes.
 * @returns The populated group.
 */
function createWorldGroupWithChildren(positions: [number, number, number][]): THREE.Group {
  const group = new THREE.Group();
  positions.forEach(([x, y, z]) => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    group.add(mesh);
  });
  return group;
}

/**
 * Finds the first Group child in a scene (the viewport clone).
 *
 * @param scene The scene to search.
 * @returns The first group child.
 */
function findCloneGroup(scene: THREE.Scene): THREE.Group {
  const group = scene.children.find((child) => child instanceof THREE.Group);
  if (!group || !(group instanceof THREE.Group)) {
    throw new Error('Expected a clone group in the scene');
  }
  return group;
}

describe('ViewportSyncManager', () => {
  let syncManager: ViewportSyncManager;
  let sceneTop: THREE.Scene;
  let sceneFront: THREE.Scene;
  let sceneSide: THREE.Scene;
  let scene3D: THREE.Scene;
  let viewportTop: Viewport2D;
  let viewportFront: Viewport2D;
  let viewportSide: Viewport2D;
  let viewport3D: Viewport3D;

  beforeEach(() => {
    sceneTop = new THREE.Scene();
    sceneFront = new THREE.Scene();
    sceneSide = new THREE.Scene();
    scene3D = new THREE.Scene();
    viewportTop = createViewport2DMock(sceneTop);
    viewportFront = createViewport2DMock(sceneFront);
    viewportSide = createViewport2DMock(sceneSide);
    viewport3D = createViewport3DMock(scene3D);
    syncManager = new ViewportSyncManager(viewportTop, viewportFront, viewportSide, viewport3D);
  });

  describe('syncWorldObjectToViewports', () => {
    it('should keep world mesh geometry alive after resync dispose cycle', () => {
      const worldObject = createWorldGroupWithChildren([[0, 0, 0]]);
      const originalGeometry = (worldObject.children[0] as THREE.Mesh).geometry;
      syncManager.syncWorldObjectToViewports(worldObject);
      syncManager.syncWorldObjectToViewports(worldObject);
      expect((worldObject.children[0] as THREE.Mesh).geometry).toBe(originalGeometry);
      expect(originalGeometry.getAttribute('position')).toBeTruthy();
    });

    it('should place independent clones into all 2D scenes', () => {
      const worldObject = createWorldGroupWithChildren([[1, 2, 3]]);
      syncManager.syncWorldObjectToViewports(worldObject);
      expect(sceneTop.children.some((c) => c instanceof THREE.Group)).toBe(true);
      expect(sceneFront.children.some((c) => c instanceof THREE.Group)).toBe(true);
      expect(sceneSide.children.some((c) => c instanceof THREE.Group)).toBe(true);
      const cloneMesh = findCloneGroup(sceneTop).children[0] as THREE.Mesh;
      const worldMesh = worldObject.children[0] as THREE.Mesh;
      expect(cloneMesh.geometry).not.toBe(worldMesh.geometry);
    });
  });

  describe('syncClonePositionsToWorldObject', () => {
    it('should mirror child positions from original to all 2D viewport clones', () => {
      const worldObject = createWorldGroupWithChildren([
        [1, 2, 3],
        [4, 5, 6],
      ]);
      syncManager.syncWorldObjectToViewports(worldObject);

      worldObject.children[0]!.position.set(10, 20, 30);
      worldObject.children[1]!.position.set(40, 50, 60);
      syncManager.syncClonePositionsToWorldObject(worldObject);

      const clone1 = findCloneGroup(sceneTop);
      const clone2 = findCloneGroup(sceneFront);
      const clone3 = findCloneGroup(sceneSide);
      expect(clone1.children[0]!.position.x).toBe(10);
      expect(clone1.children[0]!.position.y).toBe(20);
      expect(clone1.children[0]!.position.z).toBe(30);
      expect(clone2.children[1]!.position.x).toBe(40);
      expect(clone2.children[1]!.position.y).toBe(50);
      expect(clone2.children[1]!.position.z).toBe(60);
      expect(clone3.children[0]!.position.x).toBe(10);
      expect(clone3.children[1]!.position.y).toBe(50);
    });

    it('should mirror rotation and scale from original to clones', () => {
      const worldObject = createWorldGroupWithChildren([[0, 0, 0]]);
      syncManager.syncWorldObjectToViewports(worldObject);

      worldObject.children[0]!.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
      worldObject.children[0]!.scale.set(2, 3, 4);
      syncManager.syncClonePositionsToWorldObject(worldObject);

      const clone = findCloneGroup(sceneTop);
      expect(clone.children[0]!.quaternion.x).toBeCloseTo(worldObject.children[0]!.quaternion.x);
      expect(clone.children[0]!.quaternion.y).toBeCloseTo(worldObject.children[0]!.quaternion.y);
      expect(clone.children[0]!.quaternion.z).toBeCloseTo(worldObject.children[0]!.quaternion.z);
      expect(clone.children[0]!.quaternion.w).toBeCloseTo(worldObject.children[0]!.quaternion.w);
      expect(clone.children[0]!.scale.x).toBe(2);
      expect(clone.children[0]!.scale.y).toBe(3);
      expect(clone.children[0]!.scale.z).toBe(4);
    });

    it('should sync matching children when clone child counts differ', () => {
      const worldObject = createWorldGroupWithChildren([
        [0, 0, 0],
        [1, 1, 1],
      ]);
      syncManager.syncWorldObjectToViewports(worldObject);
      const clone = findCloneGroup(sceneTop);
      clone.remove(clone.children[1]!);

      worldObject.children[0]!.position.set(99, 99, 99);
      syncManager.syncClonePositionsToWorldObject(worldObject);

      expect(clone.children[0]!.position.x).toBe(99);
      expect(clone.children.length).toBe(1);
    });

    it('should skip viewports that have no clone group present', () => {
      const worldObject = createWorldGroupWithChildren([[1, 2, 3]]);
      syncManager.syncWorldObjectToViewports(worldObject);
      sceneFront.clear();
      sceneSide.clear();
      sceneFront.add(new THREE.AmbientLight());
      sceneSide.add(new THREE.DirectionalLight());

      worldObject.children[0]!.position.set(100, 200, 300);

      expect(() => syncManager.syncClonePositionsToWorldObject(worldObject)).not.toThrow();
      expect(findCloneGroup(sceneTop).children[0]!.position.x).toBe(100);
    });

    it('keeps solid brush edge wireframes visible in 2D after 3D edge culling', () => {
      const worldObject = new THREE.Group();
      const brush = SolidBrushVisual.createBoxPreview('Brush', 2, SolidOperation.Additive);
      worldObject.add(brush);
      hideAllBrushEdges(brush);
      syncManager.syncWorldObjectToViewports(worldObject);
      const cloneBrush = findCloneGroup(sceneTop).children[0] as THREE.Mesh;
      const cloneEdges = collectBrushEdges(cloneBrush);
      expect(cloneEdges.length).toBeGreaterThan(0);
      cloneEdges.forEach((edge) => expect(edge.visible).toBe(true));
    });

    it('does not hide 2D brush edges when world edges stay culled during transform sync', () => {
      const worldObject = new THREE.Group();
      const brush = SolidBrushVisual.createBoxPreview('Brush', 2, SolidOperation.Additive);
      worldObject.add(brush);
      syncManager.syncWorldObjectToViewports(worldObject);
      hideAllBrushEdges(brush);
      brush.position.set(5, 0, 0);
      syncManager.syncClonePositionsToWorldObject(worldObject);
      const cloneBrush = findCloneGroup(sceneTop).children[0] as THREE.Mesh;
      expect(cloneBrush.position.x).toBe(5);
      const cloneEdges = collectBrushEdges(cloneBrush);
      expect(cloneEdges.length).toBeGreaterThan(0);
      cloneEdges.forEach((edge) => expect(edge.visible).toBe(true));
    });

    it('marks brush clones as orthographic so selected hull fills ignore depth', () => {
      const worldObject = new THREE.Group();
      const brush = SolidBrushVisual.createBoxPreview('Brush', 2, SolidOperation.Additive);
      worldObject.add(brush);
      syncManager.syncWorldObjectToViewports(worldObject);
      const scenes = [sceneTop, sceneFront, sceneSide];
      scenes.forEach((scene) => {
        const cloneBrush = findCloneGroup(scene).children[0] as THREE.Mesh;
        expect(SolidBrushVisual.isOrthoCloneBrush(cloneBrush)).toBe(true);
        SolidBrushVisual.setHullFillVisible(cloneBrush, true);
        const fill = cloneBrush.material as THREE.MeshBasicMaterial;
        expect(fill.depthTest).toBe(false);
        expect(fill.depthWrite).toBe(false);
        expect(cloneBrush.renderOrder).toBeGreaterThan(2);
      });
      // World mesh keeps depth-tested fill for the 3D viewport.
      SolidBrushVisual.setHullFillVisible(brush, true);
      expect((brush.material as THREE.MeshBasicMaterial).depthTest).toBe(true);
    });

    it('disables depth testing on brush edges in every 2D clone including side', () => {
      const worldObject = new THREE.Group();
      const brush = SolidBrushVisual.createBoxPreview('Brush', 2, SolidOperation.Additive);
      worldObject.add(brush);
      syncManager.syncWorldObjectToViewports(worldObject);
      const scenes = [sceneTop, sceneFront, sceneSide];
      scenes.forEach((scene) => {
        const cloneBrush = findCloneGroup(scene).children[0] as THREE.Mesh;
        const cloneEdges = collectBrushEdges(cloneBrush);
        expect(cloneEdges.length).toBeGreaterThan(0);
        cloneEdges.forEach((edge) => {
          expect(edge.visible).toBe(true);
          expect(edge.frustumCulled).toBe(false);
          const material = edge.material as THREE.Material;
          expect(material.depthTest).toBe(false);
        });
      });
    });
  });
});

/**
 * Hides every solid brush edge child on a brush mesh (3D distance cull).
 *
 * @param brush Solid brush preview mesh.
 */
function hideAllBrushEdges(brush: THREE.Mesh): void {
  collectBrushEdges(brush).forEach((edge) => {
    edge.visible = false;
  });
}

/**
 * Collects solid brush edge line children, including occluded passes.
 *
 * @param mesh Brush preview mesh.
 * @returns Edge line segments.
 */
function collectBrushEdges(mesh: THREE.Mesh): THREE.LineSegments[] {
  return mesh.children.filter(
    (child): child is THREE.LineSegments =>
      child instanceof THREE.LineSegments && child.userData[SOLID_BRUSH_EDGE_USERDATA_KEY] === true,
  );
}
