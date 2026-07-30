import { describe, expect, it, afterEach } from 'vitest';
import * as THREE from 'three';
import { ShadingMode } from '@/types/shading_mode.js';
import {
  applySharedShadingPass,
  disposeSharedShadingPass,
  invalidateSharedShadingPass,
} from '@/viewports/shared/shared_shading_pass.js';
import { clearSharedContentMaterialStoreForTests } from '@/viewports/shared/shared_content_material_store.js';

describe('shared_shading_pass', () => {
  afterEach(() => {
    disposeSharedShadingPass();
    clearSharedContentMaterialStoreForTests();
  });

  it('should skip re-applying the same mode on consecutive multi-view passes', () => {
    const scene = new THREE.Scene();
    const material = new THREE.MeshStandardMaterial({ color: 0x336699 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    scene.add(mesh);
    applySharedShadingPass(scene, ShadingMode.WIREFRAME, true);
    const wireMaterial = mesh.material as THREE.Material;
    expect(wireMaterial.colorWrite).toBe(false);
    applySharedShadingPass(scene, ShadingMode.WIREFRAME, false);
    expect(mesh.material).toBe(wireMaterial);
    applySharedShadingPass(scene, ShadingMode.SOLID, false);
    expect(mesh.material).toBe(material);
  });

  it('should re-apply after invalidate even when mode is unchanged', () => {
    const scene = new THREE.Scene();
    const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    scene.add(mesh);
    applySharedShadingPass(scene, ShadingMode.FLAT, true);
    expect(mesh.material).toBeInstanceOf(THREE.MeshBasicMaterial);
    const firstFlatMaterial = mesh.material;
    if (!(firstFlatMaterial instanceof THREE.MeshBasicMaterial)) {
      throw new Error('FLAT mode should replace mesh material with MeshBasicMaterial');
    }
    expect(firstFlatMaterial.color.getHex()).toBe(0xff0000);
    invalidateSharedShadingPass();
    applySharedShadingPass(scene, ShadingMode.FLAT, false);
    expect(mesh.material).not.toBe(material);
    expect(mesh.material).toBeInstanceOf(THREE.MeshBasicMaterial);
    const secondFlatMaterial = mesh.material;
    if (!(secondFlatMaterial instanceof THREE.MeshBasicMaterial)) {
      throw new Error('FLAT mode should replace mesh material with MeshBasicMaterial after invalidate');
    }
    expect(secondFlatMaterial.color.getHex()).toBe(0xff0000);
  });
});
