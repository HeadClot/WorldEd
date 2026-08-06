import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { EditorOrientation } from '@/navigation/orientation/editor_orientation.js';
import { EDITOR_DEFAULT_UP } from '@/navigation/orientation/editor_orientation_basis.js';

describe('EditorOrientation', () => {
  it('starts as the default world Y-up orientation', () => {
    const orientation = new EditorOrientation();
    expect(orientation.isDefault()).toBe(true);
    expect(orientation.getUp().distanceTo(EDITOR_DEFAULT_UP)).toBeLessThan(1e-8);
  });

  it('aligns editor up to a face normal and notifies listeners', () => {
    const orientation = new EditorOrientation();
    let notified = 0;
    orientation.subscribe(() => {
      notified += 1;
    });
    const normal = new THREE.Vector3(0, -1, 0);
    const pivot = new THREE.Vector3(1, 2, 3);
    orientation.setFromFaceNormal(normal, pivot);
    expect(orientation.isDefault()).toBe(false);
    expect(orientation.getUp().distanceTo(normal)).toBeLessThan(1e-6);
    const frame = orientation.getPlaneFrame();
    expect(frame.origin.distanceTo(pivot)).toBeLessThan(1e-8);
    expect(notified).toBe(1);
  });

  it('resets to default orientation', () => {
    const orientation = new EditorOrientation();
    orientation.setFromFaceNormal(new THREE.Vector3(1, 0, 0), new THREE.Vector3());
    orientation.resetToDefault();
    expect(orientation.isDefault()).toBe(true);
    expect(orientation.getUp().distanceTo(EDITOR_DEFAULT_UP)).toBeLessThan(1e-8);
  });
});
