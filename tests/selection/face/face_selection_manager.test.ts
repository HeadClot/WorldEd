import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { FaceSelectionManager } from '../../../src/selection/face/face_selection_manager.js';
import { SOLID_TRIANGLE_SOURCES_USERDATA_KEY } from '../../../src/solid/model/solid_model_keys.js';

describe('FaceSelectionManager', () => {
  let manager: FaceSelectionManager;
  let meshA: THREE.Mesh;
  let meshB: THREE.Mesh;

  beforeEach(() => {
    manager = new FaceSelectionManager();
    meshA = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    meshB = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  });

  it('should start with empty selection', () => {
    expect(manager.getSelectedFaceCount()).toBe(0);
    expect(manager.getSelectedFaces()).toEqual([]);
  });

  it('should select a whole coplanar face on a box (two triangles)', () => {
    manager.selectFace(meshA, 0, false);
    expect(manager.getSelectedFaceCount()).toBe(2);
    expect(manager.isFaceSelected(meshA, 0)).toBe(true);
  });

  it('should select only one triangle when expand is disabled', () => {
    manager.selectFace(meshA, 0, false, false);
    expect(manager.getSelectedFaceCount()).toBe(1);
    expect(manager.isFaceSelected(meshA, 0)).toBe(true);
  });

  it('should clear previous selection when not adding to selection', () => {
    manager.selectFace(meshA, 0, false, false);
    manager.selectFace(meshB, 1, false, false);
    expect(manager.getSelectedFaceCount()).toBe(1);
    expect(manager.isFaceSelected(meshA, 0)).toBe(false);
    expect(manager.isFaceSelected(meshB, 1)).toBe(true);
  });

  it('should add to existing selection when addToSelection is true', () => {
    manager.selectFace(meshA, 0, false, false);
    manager.selectFace(meshA, 1, true, false);
    expect(manager.getSelectedFaceCount()).toBe(2);
    expect(manager.isFaceSelected(meshA, 0)).toBe(true);
    expect(manager.isFaceSelected(meshA, 1)).toBe(true);
  });

  it('should not duplicate when selecting the same face', () => {
    manager.selectFace(meshA, 0, false, false);
    manager.selectFace(meshA, 0, false, false);
    expect(manager.getSelectedFaceCount()).toBe(1);
  });

  it('should not duplicate when adding the same face', () => {
    manager.selectFace(meshA, 0, false, false);
    manager.selectFace(meshA, 0, true, false);
    expect(manager.getSelectedFaceCount()).toBe(1);
  });

  it('should deselect all faces', () => {
    manager.selectFace(meshA, 0, false, false);
    manager.selectFace(meshA, 1, true, false);
    manager.selectFace(meshB, 0, true, false);
    manager.deselectAll();
    expect(manager.getSelectedFaceCount()).toBe(0);
  });

  it('should handle deselectAll on empty selection without error', () => {
    expect(() => manager.deselectAll()).not.toThrow();
  });

  it('should remove a specific face from selection', () => {
    manager.selectFace(meshA, 0, false, false);
    manager.selectFace(meshA, 1, true, false);
    manager.removeFace(meshA, 0);
    expect(manager.getSelectedFaceCount()).toBe(1);
    expect(manager.isFaceSelected(meshA, 0)).toBe(false);
    expect(manager.isFaceSelected(meshA, 1)).toBe(true);
  });

  it('should handle removing non-selected face gracefully', () => {
    manager.selectFace(meshA, 0, false, false);
    manager.removeFace(meshB, 5);
    expect(manager.getSelectedFaceCount()).toBe(1);
  });

  it('should prune faces whose mesh left the scene while keeping others', () => {
    const world = new THREE.Group();
    world.add(meshA);
    world.add(meshB);
    manager.selectFace(meshA, 0, false, false);
    manager.selectFace(meshB, 0, true, false);
    world.remove(meshA);
    const changed = manager.pruneInvalidSelections(world);
    expect(changed).toBe(true);
    expect(manager.getSelectedFaceCount()).toBe(1);
    expect(manager.isFaceSelected(meshB, 0)).toBe(true);
    expect(manager.isFaceSelected(meshA, 0)).toBe(false);
  });

  it('should prune solid brush-face selection when that brush surface is gone', () => {
    const world = new THREE.Group();
    const result = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    world.add(result);
    const triangleCount = result.geometry.index
      ? result.geometry.index.count / 3
      : result.geometry.getAttribute('position').count / 3;
    const sources: Array<{ brushId: string; surfaceIndex: number }> = [];
    for (let index = 0; index < triangleCount; index++) {
      sources.push(index < 3 ? { brushId: 'kept', surfaceIndex: 0 } : { brushId: 'gone', surfaceIndex: 0 });
    }
    result.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] = sources;
    manager.selectFace(result, 0, false);
    manager.selectFace(result, 3, true);
    expect(manager.getSelectedFaceCount()).toBe(2);
    // Simulate undo removing the "gone" brush: only kept surfaces remain.
    result.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] = sources.map(() => ({
      brushId: 'kept',
      surfaceIndex: 0,
    }));
    const changed = manager.pruneInvalidSelections(world);
    expect(changed).toBe(true);
    expect(manager.getSelectedFaceCount()).toBe(1);
    const remaining = manager.getSelectedFaces()[0]!;
    expect(remaining.regionKey).toContain('kept');
    expect(remaining.regionKey).not.toContain('gone');
  });

  it('should fire callback on selection change', () => {
    let callbackCount = 0;
    manager.setSelectionChangedCallback(() => {
      callbackCount++;
    });
    manager.selectFace(meshA, 0, false, false);
    expect(callbackCount).toBe(1);
  });

  it('should fire callback with correct selection array', () => {
    let capturedFaces: ReturnType<typeof manager.getSelectedFaces> | undefined;
    manager.setSelectionChangedCallback((faces) => {
      capturedFaces = faces;
    });
    manager.selectFace(meshA, 0, false, false);
    expect(capturedFaces).toBeDefined();
    expect(capturedFaces!.length).toBe(1);
    expect(capturedFaces![0]!.mesh).toBe(meshA);
    expect(capturedFaces![0]!.faceIndex).toBe(0);
  });

  it('should compute average normal for a single face', () => {
    const geometry = createTriangleOnXZPlane();
    const testMesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    manager.selectFace(testMesh, 0, false);
    const normal = manager.computeAverageNormal();
    expect(normal.length()).toBeCloseTo(1);
  });

  it('should compute average normal for multiple faces', () => {
    const geometry1 = createTriangleOnXZPlane();
    const mesh1 = new THREE.Mesh(geometry1, new THREE.MeshBasicMaterial());
    const geometry2 = createTriangleOnXZPlane();
    const mesh2 = new THREE.Mesh(geometry2, new THREE.MeshBasicMaterial());
    manager.selectFace(mesh1, 0, false);
    manager.selectFace(mesh2, 0, true);
    const normal = manager.computeAverageNormal();
    expect(normal.length()).toBeCloseTo(1);
  });

  it('should return zero-ish normal for empty selection', () => {
    const normal = manager.computeAverageNormal();
    expect(normal.x).toBeCloseTo(0, 3);
    expect(normal.y).toBeCloseTo(0, 3);
    expect(normal.z).toBeCloseTo(0, 3);
  });

  it('should clear all state', () => {
    manager.selectFace(meshA, 0, false);
    let callbackFired = false;
    manager.setSelectionChangedCallback(() => {
      callbackFired = true;
    });
    manager.clear();
    expect(manager.getSelectedFaceCount()).toBe(0);
    manager.selectFace(meshA, 0, false);
    expect(callbackFired).toBe(false);
  });
});

/**
 * Creates a simple triangle geometry on the XZ plane facing up.
 *
 * @returns A buffer geometry with 3 vertices forming one triangle.
 */
function createTriangleOnXZPlane(): THREE.BufferGeometry {
  const vertices = new Float32Array([0, 0, 0, 1, 0, 0, 0.5, 0, 1]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  return geometry;
}
