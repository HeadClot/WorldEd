import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  TextureLockSettings,
  isContentMeshEligibleForTextureLockRebake,
} from '../../../src/texture/lock/texture_lock_settings.js';
import {
  contentMeshMappingsMatchCurrentUvs,
  syncContentMeshFaceMappingsToCurrentUvs,
} from '../../../src/texture/lock/content_mesh_texture_lock.js';
import { initializeMeshTextureUVs } from '../../../src/texture/uv/face_texture_applier.js';
import { rebakeStoredFaceTextureMaps } from '../../../src/texture/uv/planar_uv_projector.js';
import { SolidModel } from '../../../src/solid/model/solid_model.js';
import { SolidOperation } from '../../../src/solid/types/solid_operation.js';
import { createDefaultFaceTextureMapping } from '../../../src/texture/uv/face_texture_mapping.js';
import { getFaceTextureMaps, setFaceTextureMaps } from '../../../src/texture/uv/face_texture_storage.js';

describe('TextureLockSettings', () => {
  let settings: TextureLockSettings;

  beforeEach(() => {
    settings = new TextureLockSettings();
  });

  it('should start with position lock on and stretch lock off', () => {
    expect(settings.isLocked()).toBe(true);
    expect(settings.isPositionLocked()).toBe(true);
    expect(settings.isStretchLocked()).toBe(false);
  });

  it('should toggle lock state', () => {
    expect(settings.toggle()).toBe(true);
    expect(settings.isPositionLocked()).toBe(true);
    expect(settings.isStretchLocked()).toBe(true);
    expect(settings.toggle()).toBe(false);
    expect(settings.isLocked()).toBe(false);
  });

  it('should toggle position and stretch locks independently', () => {
    expect(settings.togglePositionLock()).toBe(false);
    expect(settings.isPositionLocked()).toBe(false);
    expect(settings.isStretchLocked()).toBe(false);
    expect(settings.toggleStretchLock()).toBe(true);
    expect(settings.isStretchLocked()).toBe(true);
  });

  it('should stick UVs when scaling under stretch lock (no world rebake)', () => {
    settings.setStretchLocked(true);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh);
    const uvBefore = cloneUvArray(mesh);
    mesh.scale.x = 2;
    mesh.updateMatrixWorld(true);
    settings.applyContentTransformPolicy([mesh], false, true);
    expect(cloneUvArray(mesh)).toEqual(uvBefore);
  });

  it('should rebake world density when scaling with stretch lock off', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh);
    const maxUBefore = maxAbsUvComponent(mesh, 0);
    settings.setStretchLocked(false);
    mesh.scale.x = 2;
    mesh.updateMatrixWorld(true);
    settings.applyContentTransformPolicy([mesh], false, true);
    const maxUAfter = maxAbsUvComponent(mesh, 0);
    expect(maxUAfter).toBeGreaterThan(maxUBefore + 0.2);
  });

  it('should stick UVs when rotating under position lock', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh);
    const uvBefore = cloneUvArray(mesh);
    mesh.rotation.y = Math.PI / 4;
    mesh.updateMatrixWorld(true);
    settings.applyContentTransformPolicy([mesh], true, false);
    expect(cloneUvArray(mesh)).toEqual(uvBefore);
  });

  it('should rebake when rotating with position lock off', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh);
    const uvBefore = cloneUvArray(mesh);
    settings.setPositionLocked(false);
    mesh.rotation.y = Math.PI / 2;
    mesh.updateMatrixWorld(true);
    settings.applyContentTransformPolicy([mesh], true, false);
    expect(cloneUvArray(mesh)).not.toEqual(uvBefore);
  });

  it('should keep world-mode UVs stable when moving then scaling if each step rebakes', () => {
    settings.setLocked(false);
    const stepped = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const finalOnly = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    initializeMeshTextureUVs(stepped);
    initializeMeshTextureUVs(finalOnly);

    stepped.position.x = 2;
    stepped.updateMatrixWorld(true);
    settings.rebakeMeshesIfLocked([stepped]);
    stepped.scale.x = 2;
    stepped.updateMatrixWorld(true);
    settings.rebakeMeshesIfLocked([stepped]);

    finalOnly.position.x = 2;
    finalOnly.scale.x = 2;
    finalOnly.updateMatrixWorld(true);
    settings.rebakeMeshesIfLocked([finalOnly]);

    const steppedUvs = cloneUvArray(stepped);
    const finalUvs = cloneUvArray(finalOnly);
    expect(steppedUvs.length).toBe(finalUvs.length);
    for (let index = 0; index < steppedUvs.length; index++) {
      expect(steppedUvs[index]).toBeCloseTo(finalUvs[index], 4);
    }
  });

  it('should keep stretched object UVs after unlocking then world-rebaking', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh);
    mesh.scale.x = 3;
    mesh.updateMatrixWorld(true);
    settings.rebakeMeshesIfLocked([mesh]);
    const uvAfterStretch = cloneUvArray(mesh);
    settings.setLocked(false);
    syncContentMeshFaceMappingsToCurrentUvs(mesh);
    settings.rebakeMeshesIfLocked([mesh]);
    const uvAfterUnlock = cloneUvArray(mesh);
    expect(uvAfterUnlock.length).toBe(uvAfterStretch.length);
    for (let index = 0; index < uvAfterStretch.length; index++) {
      expect(uvAfterUnlock[index]).toBeCloseTo(uvAfterStretch[index], 2);
    }
  });

  it('should preserve authored face scale across lock toggle on content meshes', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh);
    const maps = getFaceTextureMaps(mesh);
    expect(maps.length).toBeGreaterThan(0);
    maps[0].mapping.scaleU = 2;
    maps[0].mapping.scaleV = 1;
    setFaceTextureMaps(mesh, maps);
    rebakeStoredFaceTextureMaps(mesh);
    const uvAuthored = cloneUvArray(mesh);

    settings.setLocked(false);
    syncContentMeshFaceMappingsToCurrentUvs(mesh);
    mesh.position.x += 1;
    mesh.updateMatrixWorld(true);
    settings.rebakeMeshesIfLocked([mesh]);

    settings.setLocked(true);
    syncContentMeshFaceMappingsToCurrentUvs(mesh);
    const uvBeforeSecondUnlock = cloneUvArray(mesh);

    settings.setLocked(false);
    syncContentMeshFaceMappingsToCurrentUvs(mesh);
    settings.rebakeMeshesIfLocked([mesh]);
    const uvAfterSecondUnlock = cloneUvArray(mesh);
    for (let index = 0; index < uvBeforeSecondUnlock.length; index++) {
      expect(uvAfterSecondUnlock[index]).toBeCloseTo(uvBeforeSecondUnlock[index], 2);
    }
    expect(contentMeshMappingsMatchCurrentUvs(mesh)).toBe(true);
    expect(maxAbsUvComponent(mesh, 0)).toBeGreaterThan(maxAbsFromArray(uvAuthored, 0) * 0.5);
  });

  it('should not rebake solid result meshes under texture lock', () => {
    const model = new SolidModel('LockSkipSolid');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const mapping = createDefaultFaceTextureMapping('solid.png');
    mapping.scaleU = 2;
    mapping.scaleV = 2;
    brush.setFaceMapping(0, mapping);
    model.rebuild(true);
    const result = model.getResultMeshForSync();
    const uvBefore = cloneUvArray(result);
    setFaceTextureMaps(result, [
      {
        triangleIndices: [0, 1, 2],
        mapping: createDefaultFaceTextureMapping('corrupt.png'),
      },
    ]);
    settings.setLocked(false);
    settings.rebakeMeshesIfLocked([result]);
    expect(cloneUvArray(result)).toEqual(uvBefore);
    expect(isContentMeshEligibleForTextureLockRebake(result)).toBe(false);
    expect(isContentMeshEligibleForTextureLockRebake(brush.mesh!)).toBe(false);
  });
});

/**
 * Returns the maximum absolute UV component on an axis across all vertices.
 *
 * @param mesh Mesh with UV attribute.
 * @param component 0 for U, 1 for V.
 * @returns Max absolute component value.
 */
function maxAbsUvComponent(mesh: THREE.Mesh, component: number): number {
  const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute;
  let maxAbs = 0;
  for (let i = 0; i < uv.count; i++) {
    const value = component === 0 ? uv.getX(i) : uv.getY(i);
    maxAbs = Math.max(maxAbs, Math.abs(value));
  }
  return maxAbs;
}

/**
 * Max absolute component from a flat UV array.
 *
 * @param values Flat UV components.
 * @param component 0 for U, 1 for V.
 * @returns Max absolute value.
 */
function maxAbsFromArray(values: number[], component: number): number {
  let maxAbs = 0;
  for (let index = component; index < values.length; index += 2) {
    maxAbs = Math.max(maxAbs, Math.abs(values[index]));
  }
  return maxAbs;
}

/**
 * Copies the UV attribute into a plain number array for stable comparisons.
 *
 * @param mesh Mesh with UV attribute.
 * @returns Flat UV component list.
 */
function cloneUvArray(mesh: THREE.Mesh): number[] {
  const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute;
  return Array.from(uv.array as ArrayLike<number>);
}
