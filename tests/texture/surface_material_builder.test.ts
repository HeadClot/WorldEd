import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { rebuildSurfaceMaterials } from '../../src/texture/surface_material_builder.js';
import { setFaceTextureMaps, getFaceTextureMaps } from '../../src/texture/face_texture_storage.js';
import { createDefaultFaceTextureMapping } from '../../src/texture/face_texture_mapping.js';
import {
  setTextureMapCacheForTests,
  TextureMapCache,
} from '../../src/texture/texture_map_cache.js';

/**
 * Unit tests for multi-material batching on content meshes.
 */
describe('rebuildSurfaceMaterials', () => {
  beforeEach(() => {
    setTextureMapCacheForTests(new TextureMapCache());
  });

  afterEach(() => {
    setTextureMapCacheForTests(null);
  });

  it('uses a single draw group layout when one texture covers the mesh', () => {
    const mesh = createTriangleMesh(4);
    setFaceTextureMaps(mesh, [
      {
        triangleIndices: [0, 1, 2, 3],
        mapping: createDefaultFaceTextureMapping('only.png'),
      },
    ]);
    rebuildSurfaceMaterials(mesh);
    expect(mesh.geometry.groups.length).toBe(0);
    expect(Array.isArray(mesh.material)).toBe(false);
    expect((mesh.material as THREE.MeshStandardMaterial).side).toBe(THREE.FrontSide);
  });

  it('merges triangles into one group per texture instead of per triangle', () => {
    const mesh = createTriangleMesh(6);
    setFaceTextureMaps(mesh, [
      {
        triangleIndices: [0, 2, 4],
        mapping: createDefaultFaceTextureMapping('a.png'),
      },
      {
        triangleIndices: [1, 3, 5],
        mapping: createDefaultFaceTextureMapping('b.png'),
      },
    ]);
    rebuildSurfaceMaterials(mesh);
    expect(Array.isArray(mesh.material)).toBe(true);
    expect((mesh.material as THREE.Material[]).length).toBe(2);
    expect(mesh.geometry.groups.length).toBe(2);
    mesh.geometry.groups.forEach((group) => {
      expect(group.count % 3).toBe(0);
      expect(group.count).toBeGreaterThanOrEqual(3);
    });
    const totalTriangles = mesh.geometry.groups.reduce((sum, group) => sum + group.count / 3, 0);
    expect(totalTriangles).toBe(6);
  });

  it('remaps face texture triangle indices after material sorting', () => {
    const mesh = createTriangleMesh(4);
    setFaceTextureMaps(mesh, [
      {
        triangleIndices: [0, 2],
        mapping: createDefaultFaceTextureMapping('a.png'),
      },
      {
        triangleIndices: [1, 3],
        mapping: createDefaultFaceTextureMapping('b.png'),
      },
    ]);
    rebuildSurfaceMaterials(mesh);
    const maps = getFaceTextureMaps(mesh);
    const aEntry = maps.find((entry) => entry.mapping.textureId === 'a.png');
    const bEntry = maps.find((entry) => entry.mapping.textureId === 'b.png');
    expect(aEntry).toBeDefined();
    expect(bEntry).toBeDefined();
    expect(aEntry!.triangleIndices).toEqual([0, 1]);
    expect(bEntry!.triangleIndices).toEqual([2, 3]);
  });
});

/**
 * Builds a non-indexed mesh with the requested triangle count.
 * @param triangleCount Number of triangles.
 * @returns Mesh with position attribute only.
 */
function createTriangleMesh(triangleCount: number): THREE.Mesh {
  const positions = new Float32Array(triangleCount * 9);
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const base = triangle * 9;
    positions[base] = triangle;
    positions[base + 1] = 0;
    positions[base + 2] = 0;
    positions[base + 3] = triangle + 1;
    positions[base + 4] = 0;
    positions[base + 5] = 0;
    positions[base + 6] = triangle;
    positions[base + 7] = 1;
    positions[base + 8] = 0;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xffffff }));
}
