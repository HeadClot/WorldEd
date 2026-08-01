import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TransformExecutor } from '@/transform/core/transform_executor.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { TransformModalAxis } from '@/transform/modal/transform_modal_axis.js';
import { transformModalApplyTranslateNumeric } from '@/transform/modal/transform_modal_apply_translate.js';
import {
  transformModalApplyRotateNumeric,
  transformModalApplyRotateViewNumeric,
} from '@/transform/modal/transform_modal_apply_rotate.js';
import {
  transformModalApplyScaleFreeNumeric,
  transformModalApplyScaleNumeric,
} from '@/transform/modal/transform_modal_apply_scale.js';

/**
 * Creates an object with an identity pose for absolute transform tests.
 *
 * @returns Fresh Object3D at the origin.
 */
function createObject(): THREE.Object3D {
  return new THREE.Object3D();
}

/**
 * Snapshots positions for absolute apply helpers.
 *
 * @param objects Drag targets.
 * @returns Position map.
 */
function snapshotPositions(objects: THREE.Object3D[]): Map<THREE.Object3D, THREE.Vector3> {
  const map = new Map<THREE.Object3D, THREE.Vector3>();
  for (const object of objects) {
    map.set(object, object.position.clone());
  }
  return map;
}

/**
 * Snapshots quaternions for absolute apply helpers.
 *
 * @param objects Drag targets.
 * @returns Quaternion map.
 */
function snapshotQuaternions(objects: THREE.Object3D[]): Map<THREE.Object3D, THREE.Quaternion> {
  const map = new Map<THREE.Object3D, THREE.Quaternion>();
  for (const object of objects) {
    map.set(object, object.quaternion.clone());
  }
  return map;
}

/**
 * Snapshots scales for absolute apply helpers.
 *
 * @param objects Drag targets.
 * @returns Scale map.
 */
function snapshotScales(objects: THREE.Object3D[]): Map<THREE.Object3D, THREE.Vector3> {
  const map = new Map<THREE.Object3D, THREE.Vector3>();
  for (const object of objects) {
    map.set(object, object.scale.clone());
  }
  return map;
}

describe('transform modal numeric apply helpers', () => {
  it('translates exactly along X by the typed distance', () => {
    const executor = new TransformExecutor(new GridSnap(false, 1));
    const object = createObject();
    const objects = [object];
    const ok = transformModalApplyTranslateNumeric(
      executor,
      objects,
      snapshotPositions(objects),
      0.25,
      TransformModalAxis.X,
      new THREE.Quaternion(),
    );
    expect(ok).toBe(true);
    expect(object.position.x).toBeCloseTo(0.25, 6);
    expect(object.position.y).toBeCloseTo(0, 6);
  });

  it('rotates about Z by the typed degrees', () => {
    const executor = new TransformExecutor(new GridSnap(false, 1));
    const object = createObject();
    const objects = [object];
    const ok = transformModalApplyRotateNumeric(
      executor,
      objects,
      snapshotPositions(objects),
      snapshotQuaternions(objects),
      new THREE.Vector3(),
      90,
      TransformModalAxis.Z,
      new THREE.Quaternion(),
    );
    expect(ok).toBe(true);
    const euler = new THREE.Euler().setFromQuaternion(object.quaternion, 'XYZ');
    expect(euler.z).toBeCloseTo(Math.PI / 2, 5);
  });

  it('rotates free about the camera view axis by typed degrees', () => {
    const executor = new TransformExecutor(new GridSnap(false, 1));
    const object = createObject();
    object.position.set(1, 0, 0);
    const objects = [object];
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const ok = transformModalApplyRotateViewNumeric(
      executor,
      objects,
      snapshotPositions(objects),
      snapshotQuaternions(objects),
      new THREE.Vector3(),
      180,
      camera,
    );
    expect(ok).toBe(true);
    expect(object.position.x).toBeCloseTo(-1, 5);
    expect(object.position.y).toBeCloseTo(0, 5);
  });

  it('scales along Y by the typed factor', () => {
    const executor = new TransformExecutor(new GridSnap(false, 1));
    const object = createObject();
    const objects = [object];
    const ok = transformModalApplyScaleNumeric(
      executor,
      objects,
      snapshotPositions(objects),
      snapshotScales(objects),
      new THREE.Vector3(),
      2,
      TransformModalAxis.Y,
      new THREE.Quaternion(),
    );
    expect(ok).toBe(true);
    expect(object.scale.y).toBeCloseTo(2, 6);
    expect(object.scale.x).toBeCloseTo(1, 6);
  });

  it('applies free uniform typed scale on single-use', () => {
    const executor = new TransformExecutor(new GridSnap(false, 1));
    const object = createObject();
    const objects = [object];
    const ok = transformModalApplyScaleFreeNumeric(
      executor,
      objects,
      snapshotPositions(objects),
      snapshotScales(objects),
      new THREE.Vector3(),
      3,
      new THREE.PerspectiveCamera(),
      true,
    );
    expect(ok).toBe(true);
    expect(object.scale.x).toBeCloseTo(3, 6);
    expect(object.scale.y).toBeCloseTo(3, 6);
    expect(object.scale.z).toBeCloseTo(3, 6);
  });
});
