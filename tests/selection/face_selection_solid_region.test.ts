import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { FaceSelectionManager } from '../../src/selection/face_selection_manager.js';
import { SOLID_TRIANGLE_SOURCES_USERDATA_KEY } from '../../src/solid/model/solid_model_keys.js';
import { groupSelectionsIntoFaceRegions } from '../../src/selection/face_region_grouper.js';

describe('solid face region selection', () => {
  it('stores one selection entry per brush face, not every triangle', () => {
    const mesh = createSolidMeshWithFace([
      { brushId: 'wall', surfaceIndex: 0 },
      { brushId: 'wall', surfaceIndex: 0 },
      { brushId: 'wall', surfaceIndex: 0 },
      { brushId: 'floor', surfaceIndex: 1 },
      { brushId: 'floor', surfaceIndex: 1 },
    ]);
    const manager = new FaceSelectionManager();
    manager.selectFace(mesh, 0, false);
    expect(manager.getSelectedFaceCount()).toBe(1);
    expect(manager.isFaceSelected(mesh, 2)).toBe(true);
    manager.selectFace(mesh, 1, true);
    expect(manager.getSelectedFaceCount()).toBe(1);
    manager.selectFace(mesh, 3, true);
    expect(manager.getSelectedFaceCount()).toBe(2);
  });

  it('expands solid seeds back to full triangle regions for extrusion', () => {
    const mesh = createSolidMeshWithFace([
      { brushId: 'wall', surfaceIndex: 0 },
      { brushId: 'wall', surfaceIndex: 0 },
      { brushId: 'wall', surfaceIndex: 0 },
    ]);
    const manager = new FaceSelectionManager();
    manager.selectFace(mesh, 1, false);
    const regions = groupSelectionsIntoFaceRegions(manager.getSelectedFaces());
    expect(regions).toHaveLength(1);
    expect(regions[0].faceIndices).toEqual([0, 1, 2]);
  });
});

/**
 * Creates a solid-result-like mesh with triangle sources for region tests.
 *
 * @param sources Per-triangle solid sources.
 * @returns Mesh with sources attached.
 */
function createSolidMeshWithFace(sources: Array<{ brushId: string; surfaceIndex: number }>): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  mesh.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] = sources;
  return mesh;
}
