import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  buildDefaultPlaneFrame,
  buildOrientationFromUp,
  buildPlaneFrameFromNormal,
  EDITOR_DEFAULT_UP,
  normalizeEditorUp,
} from '@/navigation/orientation/editor_orientation_basis.js';

describe('editor_orientation_basis', () => {
  it('normalizes a zero vector to default up', () => {
    const up = normalizeEditorUp(new THREE.Vector3(0, 0, 0));
    expect(up.distanceTo(EDITOR_DEFAULT_UP)).toBeLessThan(1e-8);
  });

  it('builds identity orientation for default up', () => {
    const quaternion = buildOrientationFromUp(EDITOR_DEFAULT_UP);
    const mapped = EDITOR_DEFAULT_UP.clone().applyQuaternion(quaternion);
    expect(mapped.distanceTo(EDITOR_DEFAULT_UP)).toBeLessThan(1e-6);
  });

  it('maps default up onto a wall normal', () => {
    const wallNormal = new THREE.Vector3(1, 0, 0);
    const quaternion = buildOrientationFromUp(wallNormal);
    const mapped = EDITOR_DEFAULT_UP.clone().applyQuaternion(quaternion);
    expect(mapped.distanceTo(wallNormal)).toBeLessThan(1e-6);
  });

  it('builds an orthonormal plane frame from a face normal', () => {
    const origin = new THREE.Vector3(2, 3, 4);
    const normal = new THREE.Vector3(0, 0, 1);
    const frame = buildPlaneFrameFromNormal(normal, origin);
    expect(frame.origin.distanceTo(origin)).toBeLessThan(1e-8);
    expect(frame.normal.distanceTo(normal)).toBeLessThan(1e-6);
    expect(frame.uAxis.dot(frame.normal)).toBeLessThan(1e-6);
    expect(frame.vAxis.dot(frame.normal)).toBeLessThan(1e-6);
    expect(Math.abs(frame.uAxis.dot(frame.vAxis))).toBeLessThan(1e-6);
    expect(frame.uAxis.length()).toBeCloseTo(1, 6);
    expect(frame.vAxis.length()).toBeCloseTo(1, 6);
  });

  it('returns the default XZ floor frame', () => {
    const frame = buildDefaultPlaneFrame();
    expect(frame.normal.distanceTo(EDITOR_DEFAULT_UP)).toBeLessThan(1e-8);
    expect(frame.origin.length()).toBe(0);
  });
});
