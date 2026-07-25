import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { resolveLayoutGizmoOrientation } from '../../../src/managers/layout/layout_gizmo_helpers.js';
import { TransformSpace } from '../../../src/types/transform_space.js';

describe('layout_gizmo_helpers', () => {
  it('uses identity orientation for global space', () => {
    const mesh = new THREE.Mesh();
    mesh.rotation.set(0.5, 1.0, -0.25);
    mesh.updateMatrixWorld(true);
    const orientation = resolveLayoutGizmoOrientation({ transformSpace: TransformSpace.Global }, [mesh]);
    expect(orientation.equals(new THREE.Quaternion())).toBe(true);
  });

  it('uses the single selected object world rotation for local space', () => {
    const mesh = new THREE.Mesh();
    mesh.rotation.set(0.25, -0.5, 0.75);
    mesh.updateMatrixWorld(true);
    const expected = new THREE.Quaternion();
    mesh.getWorldQuaternion(expected);
    const orientation = resolveLayoutGizmoOrientation({ transformSpace: TransformSpace.Local }, [mesh]);
    expect(orientation.equals(expected)).toBe(true);
  });

  it('uses identity orientation for multi-select local space', () => {
    const first = new THREE.Mesh();
    const second = new THREE.Mesh();
    first.rotation.set(0.1, 0.2, 0.3);
    second.rotation.set(-0.2, 0.4, -0.1);
    first.updateMatrixWorld(true);
    second.updateMatrixWorld(true);
    const orientation = resolveLayoutGizmoOrientation({ transformSpace: TransformSpace.Local }, [first, second]);
    expect(orientation.equals(new THREE.Quaternion())).toBe(true);
  });
});
