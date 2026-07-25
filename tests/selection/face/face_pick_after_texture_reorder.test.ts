import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { FaceSelectionRaycaster } from '../../../src/selection/face/face_selection_raycaster.js';
import { FaceSelectionManager } from '../../../src/selection/face/face_selection_manager.js';
import { upsertFaceTextureMap } from '../../../src/texture/uv/face_texture_storage.js';
import { createDefaultFaceTextureMapping } from '../../../src/texture/uv/face_texture_mapping.js';
import { rebuildSurfaceMaterials } from '../../../src/texture/material/surface_material_builder.js';
import { getOrBuildFacePickBvh, buildGeometryPickStamp } from '../../../src/selection/pick/mesh_pick_acceleration.js';
import { computeTriangleNormal } from '../../../src/selection/pick/triangle_geometry_utils.js';

/**
 * Multi-texture paint reorders triangles for draw-call grouping. Face picking
 * must still select the face under the cursor, not a stale BVH face.
 */
describe('face pick after multi-texture reorder', () => {
  it('invalidates face-pick acceleration when materials reorder triangles', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    // Paint non-contiguous faces so material sort permutes triangle order.
    upsertFaceTextureMap(mesh, [0, 1], createDefaultFaceTextureMapping('tex-a'));
    upsertFaceTextureMap(mesh, [8, 9], createDefaultFaceTextureMapping('tex-b'));
    upsertFaceTextureMap(mesh, [6, 7], createDefaultFaceTextureMapping('tex-c'));
    const stampBefore = buildGeometryPickStamp(mesh.geometry);
    const bvhBefore = getOrBuildFacePickBvh(mesh);
    rebuildSurfaceMaterials(mesh);
    const stampAfter = buildGeometryPickStamp(mesh.geometry);
    const bvhAfter = getOrBuildFacePickBvh(mesh);
    expect(stampAfter).not.toBe(stampBefore);
    expect(bvhAfter).not.toBe(bvhBefore);
  });

  it('selects the face whose normal faces the pick ray after three textures', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.updateMatrixWorld(true);
    upsertFaceTextureMap(mesh, [0, 1], createDefaultFaceTextureMapping('tex-a'));
    upsertFaceTextureMap(mesh, [8, 9], createDefaultFaceTextureMapping('tex-b'));
    upsertFaceTextureMap(mesh, [6, 7], createDefaultFaceTextureMapping('tex-c'));
    rebuildSurfaceMaterials(mesh);
    mesh.updateMatrixWorld(true);

    const pick = pickCubeFaceFromDirection(mesh, new THREE.Vector3(1, 0, 0));
    expect(pick).not.toBeNull();
    const manager = new FaceSelectionManager();
    manager.selectFace(mesh, pick!.faceIndex, false);
    const selected = manager.getSelectedFaces();
    expect(selected.length).toBeGreaterThan(0);
    for (const entry of selected) {
      const normal = computeTriangleNormal(mesh.geometry, entry.faceIndex);
      expect(normal.x).toBeGreaterThan(0.9);
    }
  });
});

/**
 * Picks a cube face using a camera on the given axis looking at the origin.
 *
 * @param mesh Cube mesh at the origin.
 * @param axisDirection Outward direction of the face to pick (unit-ish).
 * @returns Face pick result or null.
 */
function pickCubeFaceFromDirection(
  mesh: THREE.Mesh,
  axisDirection: THREE.Vector3,
): { mesh: THREE.Mesh; faceIndex: number } | null {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  const distance = 4;
  camera.position.copy(axisDirection).normalize().multiplyScalar(distance);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const canvas = document.createElement('canvas');
  Object.defineProperty(canvas, 'getBoundingClientRect', {
    value: () => ({ left: 0, top: 0, width: 200, height: 200 }),
  });
  const renderer = { domElement: canvas } as unknown as THREE.WebGLRenderer;
  const event = new MouseEvent('click', { clientX: 100, clientY: 100 });
  const raycaster = new FaceSelectionRaycaster();
  const result = raycaster.pickFace(event, camera, renderer, [mesh]);
  if (!result) return null;
  return { mesh: result.mesh, faceIndex: result.faceIndex };
}
