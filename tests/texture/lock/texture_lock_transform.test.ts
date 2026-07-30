import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  normalizeTextureLockFlags,
  shouldRebakeContentAfterTransform,
  shouldUpdateMappingsForLocks,
} from '@/texture/lock/texture_lock_transform.js';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import { transformBrushLocalUvForPoseChange } from '@/texture/uv_matrix/surface_uv_matrix_transform.js';

describe('texture_lock_transform', () => {
  it('normalizes boolean true to both locks on', () => {
    expect(normalizeTextureLockFlags(true)).toEqual({ positionLock: true, stretchLock: true });
  });

  it('normalizes boolean false to both locks off', () => {
    expect(normalizeTextureLockFlags(false)).toEqual({ positionLock: false, stretchLock: false });
  });

  it('passes through explicit flag pairs', () => {
    expect(normalizeTextureLockFlags({ positionLock: true, stretchLock: false })).toEqual({
      positionLock: true,
      stretchLock: false,
    });
  });

  it('does not rewrite matrices for move when position lock is on (brush-local stick)', () => {
    const prev = new THREE.Matrix4().identity();
    const next = new THREE.Matrix4().makeTranslation(2, 0, 0);
    expect(shouldUpdateMappingsForLocks(prev, next, { positionLock: true, stretchLock: true })).toBe(false);
    expect(shouldUpdateMappingsForLocks(prev, next, { positionLock: true, stretchLock: false })).toBe(false);
    expect(shouldUpdateMappingsForLocks(prev, next, { positionLock: false, stretchLock: true })).toBe(true);
  });

  it('rewrites matrices for scale only when stretch lock is off', () => {
    const prev = new THREE.Matrix4().identity();
    const next = new THREE.Matrix4().makeScale(2, 1, 1);
    expect(shouldUpdateMappingsForLocks(prev, next, { positionLock: true, stretchLock: false })).toBe(true);
    expect(shouldUpdateMappingsForLocks(prev, next, { positionLock: true, stretchLock: true })).toBe(false);
  });

  it('rebakes content when the unlocked transform component changed', () => {
    expect(shouldRebakeContentAfterTransform({ positionLock: true, stretchLock: true }, true, false)).toBe(false);
    expect(shouldRebakeContentAfterTransform({ positionLock: false, stretchLock: true }, true, false)).toBe(true);
    expect(shouldRebakeContentAfterTransform({ positionLock: true, stretchLock: false }, false, true)).toBe(true);
    expect(shouldRebakeContentAfterTransform({ positionLock: true, stretchLock: true }, false, true)).toBe(false);
  });

  it('keeps UV matrix unchanged when both locks are on under scale', () => {
    const normal = new THREE.Vector3(0, 1, 0);
    const uv = SurfaceUvMatrix.fromTrs(new THREE.Vector2(0, 0), normal, 0, 1, 1);
    const prev = new THREE.Matrix4().identity();
    const next = new THREE.Matrix4().makeScale(2, 1, 1);
    const result = transformBrushLocalUvForPoseChange(uv, normal, 0, prev, next, {
      positionLock: true,
      stretchLock: true,
    });
    expect(result.equals(uv, 1e-6)).toBe(true);
  });

  it('rewrites UV matrix for world-fixed density when stretch lock is off on scale', () => {
    const normal = new THREE.Vector3(0, 1, 0);
    const uv = SurfaceUvMatrix.fromTrs(new THREE.Vector2(0, 0), normal, 0, 1, 1);
    const prev = new THREE.Matrix4().identity();
    const next = new THREE.Matrix4().makeScale(2, 1, 1);
    next.setPosition(0.5, 0, 0);
    const result = transformBrushLocalUvForPoseChange(uv, normal, 0, prev, next, {
      positionLock: true,
      stretchLock: false,
    });
    expect(result.equals(uv, 1e-6)).toBe(false);
    const fixedWorld = new THREE.Vector3(-0.5, 0, 0);
    const fixedLocalPrev = fixedWorld.clone();
    const fixedLocalNext = fixedWorld.clone().applyMatrix4(next.clone().invert());
    expect(result.project(fixedLocalNext).u).toBeCloseTo(uv.project(fixedLocalPrev).u, 4);
  });
});
