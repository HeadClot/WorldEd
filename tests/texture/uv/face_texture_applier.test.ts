import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  applyMappingToTargets,
  buildTargetsFromMeshes,
  initializeMeshTextureUVs,
  getCommonMapping,
} from '@/texture/uv/face_texture_applier.js';
import { createDefaultFaceTextureMapping } from '@/texture/uv/face_texture_mapping.js';
import { getFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';
import { createContentMaterial } from '@/materials/factory_content_material.js';

describe('face_texture_applier', () => {
  it('should initialize UVs on a content mesh', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), createContentMaterial(0x888888));
    initializeMeshTextureUVs(mesh);
    expect(mesh.geometry.getAttribute('uv')).toBeDefined();
  });

  it('should build targets covering all faces of a box', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const targets = buildTargetsFromMeshes([mesh]);
    expect(targets.length).toBeGreaterThanOrEqual(6);
  });

  it('builds whole-mesh targets for dense geometry without multi-second hangs', () => {
    const geometry = new THREE.SphereGeometry(1, 120, 120);
    const mesh = new THREE.Mesh(geometry);
    const triangleCount = Math.floor((geometry.getIndex()?.count ?? 0) / 3);
    expect(triangleCount).toBeGreaterThan(20_000);
    const started = performance.now();
    const targets = buildTargetsFromMeshes([mesh]);
    const elapsed = performance.now() - started;
    expect(targets.length).toBeGreaterThan(0);
    const covered = new Set<number>();
    for (const target of targets) {
      for (const faceIndex of target.triangleIndices) {
        covered.add(faceIndex);
      }
    }
    expect(covered.size).toBe(triangleCount);
    expect(elapsed).toBeLessThan(1500);
    geometry.dispose();
  });

  it('should store mappings when applying to targets', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.position.set(0, 0.5, 0);
    mesh.updateMatrixWorld(true);
    const targets = buildTargetsFromMeshes([mesh]);
    const mapping = createDefaultFaceTextureMapping();
    mapping.align = 'wall';
    mapping.scaleU = 0.5;
    applyMappingToTargets(targets, mapping);
    const maps = getFaceTextureMaps(mesh);
    expect(maps.length).toBeGreaterThan(0);
    expect(maps[0]!.mapping.align).toBe('wall');
  });

  it('should report a common mapping after uniform apply', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const targets = buildTargetsFromMeshes([mesh]);
    const mapping = createDefaultFaceTextureMapping();
    mapping.offsetU = 0.25;
    applyMappingToTargets(targets, mapping);
    const common = getCommonMapping(targets);
    expect(common).not.toBeNull();
    expect(common!.offsetU!).toBeCloseTo(0.25, 5);
  });
});
