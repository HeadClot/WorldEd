import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { EditorOrientation } from '@/navigation/orientation/editor_orientation.js';
import { EDITOR_DEFAULT_UP } from '@/navigation/orientation/editor_orientation_basis.js';

describe('EditorOrientation.setPlaneOrigin', () => {
  it('moves only the lattice origin and keeps the orientation quaternion', () => {
    const orientation = new EditorOrientation();
    orientation.setFromFaceNormal(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 2, 3));
    const quaternionBefore = orientation.getQuaternion();
    const upBefore = orientation.getUp();
    orientation.setPlaneOrigin(new THREE.Vector3(10, 0, -4));
    expect(orientation.getPlaneFrame().origin.distanceTo(new THREE.Vector3(10, 0, -4))).toBeLessThan(1e-8);
    expect(orientation.getQuaternion().angleTo(quaternionBefore)).toBeLessThan(1e-6);
    expect(orientation.getUp().distanceTo(upBefore)).toBeLessThan(1e-6);
    expect(orientation.getUp().distanceTo(new THREE.Vector3(0, 0, 1))).toBeLessThan(1e-5);
  });

  it('notifies listeners when the origin changes', () => {
    const orientation = new EditorOrientation();
    let count = 0;
    orientation.subscribe(() => {
      count += 1;
    });
    orientation.setPlaneOrigin(new THREE.Vector3(1, 0, 0));
    expect(count).toBe(1);
    expect(orientation.getUp().distanceTo(EDITOR_DEFAULT_UP)).toBeLessThan(1e-8);
  });
});
