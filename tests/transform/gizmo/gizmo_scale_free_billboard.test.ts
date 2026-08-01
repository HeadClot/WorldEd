import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { applyGizmoScaleFreeBillboards } from '@/transform/gizmo/gizmo_scale_free_billboard.js';
import { GIZMO_SCALE_FREE_BILLBOARD_USERDATA } from '@/transform/gizmo/gizmo_visual_style.js';

describe('applyGizmoScaleFreeBillboards', () => {
  it('copies the camera quaternion onto free-scale billboard roots', () => {
    const group = new THREE.Group();
    const billboard = new THREE.Group();
    billboard.userData[GIZMO_SCALE_FREE_BILLBOARD_USERDATA] = true;
    group.add(billboard);
    const plain = new THREE.Group();
    group.add(plain);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(3, 4, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    applyGizmoScaleFreeBillboards(group, camera);
    expect(billboard.quaternion.equals(camera.quaternion)).toBe(true);
    expect(plain.quaternion.equals(camera.quaternion)).toBe(false);
  });
});
