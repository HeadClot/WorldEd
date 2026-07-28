import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { rebuildSolidResultMaterials } from '../../../src/texture/material/surface_material_builder.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '../../../src/texture/library/texture_id.js';
import { setTextureMapCacheForTests, TextureMapCache } from '../../../src/texture/library/texture_map_cache.js';
import { applySharedShadingPass, disposeSharedShadingPass } from '../../../src/viewports/shared_shading_pass.js';
import {
  clearSharedContentMaterialStoreForTests,
  getSharedContentMaterials,
} from '../../../src/viewports/shared_content_material_store.js';
import { ShadingMode } from '../../../src/types/shading_mode.js';

/**
 * Regression: after multi-view leaves the shared scene in wireframe (black
 * colorWrite-false overrides), solid material rebuild must not bake black into
 * content materials or poison the shared content snapshot.
 */
describe('rebuildSolidResultMaterials while wireframe shading is live', () => {
  beforeEach(() => {
    setTextureMapCacheForTests(new TextureMapCache());
    clearSharedContentMaterialStoreForTests();
    disposeSharedShadingPass();
  });

  afterEach(() => {
    disposeSharedShadingPass();
    clearSharedContentMaterialStoreForTests();
    setTextureMapCacheForTests(null);
  });

  it('keeps content tint white after rebuild under active wireframe overrides', () => {
    const scene = new THREE.Scene();
    const geometry = createUnitCubeGeometry();
    const contentMaterial = new THREE.MeshMatcapMaterial({ color: 0xffffff });
    const mesh = new THREE.Mesh(geometry, contentMaterial);
    scene.add(mesh);
    applySharedShadingPass(scene, ShadingMode.WIREFRAME, true);
    expect((mesh.material as THREE.Material).colorWrite).toBe(false);
    rebuildSolidResultMaterials(mesh, [
      {
        triangleIndices: triangleIndexList(geometry),
        textureId: DEFAULT_CHECKER_TEXTURE_ID,
      },
    ]);
    const rebuilt = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    expect(rebuilt).toBeInstanceOf(THREE.MeshMatcapMaterial);
    expect((rebuilt as THREE.MeshMatcapMaterial).color.getHex()).toBe(0xffffff);
    expect((rebuilt as THREE.Material).colorWrite).not.toBe(false);
    const snapshot = getSharedContentMaterials(mesh.uuid);
    expect(snapshot).not.toBeNull();
    const snapMaterial = Array.isArray(snapshot!.materials) ? snapshot!.materials[0] : snapshot!.materials;
    expect((snapMaterial as THREE.MeshMatcapMaterial).color.getHex()).toBe(0xffffff);
    applySharedShadingPass(scene, ShadingMode.SOLID, true);
    const restored = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    expect((restored as THREE.MeshMatcapMaterial).color.getHex()).toBe(0xffffff);
  });
});

/**
 * Builds a non-indexed cube with twelve triangles for material rebuild tests.
 *
 * @returns BufferGeometry for a unit box.
 */
function createUnitCubeGeometry(): THREE.BufferGeometry {
  return new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
}

/**
 * Lists every triangle index for a geometry.
 *
 * @param geometry Mesh geometry.
 * @returns Triangle indices 0..n-1.
 */
function triangleIndexList(geometry: THREE.BufferGeometry): number[] {
  const position = geometry.getAttribute('position');
  const triangleCount = position ? Math.floor(position.count / 3) : 0;
  return Array.from({ length: triangleCount }, (_, index) => index);
}
