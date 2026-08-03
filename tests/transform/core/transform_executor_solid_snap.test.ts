import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { TransformExecutor } from '@/transform/core/transform_executor.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';

/**
 * Builds a solid with a large additive and a subtractive hull that sticks past
 * the compiled result so hierarchy AABB and result AABB differ.
 *
 * @returns Solid model with result geometry ready for snap tests.
 */
function createSolidWithProtrudingSubtractive(): SolidModel {
  const model = new SolidModel('SnapSolid');
  const additive = model.addBoxBrush(4, SolidOperation.Additive, null, false);
  additive.position.set(0, 0, 0);
  additive.pushTransformToMesh();
  const subtractive = model.addBoxBrush(2, SolidOperation.Subtractive, null, false);
  subtractive.position.set(3, 0, 0);
  subtractive.pushTransformToMesh();
  model.markDirty();
  model.rebuild(true);
  return model;
}

/**
 * Returns world AABB min of a mesh from its geometry.
 *
 * @param mesh Mesh with geometry.
 * @returns World-space min corner.
 */
function meshWorldAabbMin(mesh: THREE.Mesh): THREE.Vector3 {
  const root = mesh.parent;
  if (root) root.updateMatrixWorld(true);
  else mesh.updateMatrixWorld(true);
  if (!mesh.geometry.boundingBox) {
    mesh.geometry.computeBoundingBox();
  }
  const local = mesh.geometry.boundingBox!;
  const box = local.clone().applyMatrix4(mesh.matrixWorld);
  return box.min.clone();
}

describe('TransformExecutor solid model translation snap', () => {
  it('snaps movement in grid steps without collapsing solid-local brush offsets', () => {
    const model = createSolidWithProtrudingSubtractive();
    const world = new THREE.Group();
    world.add(model.root);
    model.root.position.set(0.13, 0, 0.07);
    const brushLocalBefore = model.getBrushes().map((brush) => brush.mesh!.position.clone());
    const executor = new TransformExecutor(new GridSnap(true, 0.25));
    const start = model.root.position.clone();
    const initials = new Map<THREE.Object3D, THREE.Vector3>([[model.root, start.clone()]]);
    executor.applyAbsoluteTranslation([model.root], initials, new THREE.Vector3(0.37, 0, 0.19));
    expect(model.root.position.x).toBeCloseTo(0.38, 5);
    expect(model.root.position.z).toBeCloseTo(0.32, 5);
    model.getBrushes().forEach((brush, index) => {
      expect(brush.mesh!.position.distanceTo(brushLocalBefore[index]!)).toBeLessThan(1e-8);
    });
  });

  it('moves an off-grid solid root by whole grid steps while preserving result offset', () => {
    const model = createSolidWithProtrudingSubtractive();
    const world = new THREE.Group();
    world.add(model.root);
    model.root.position.set(0.1, 0, 0);
    model.root.updateMatrixWorld(true);
    const resultMinBefore = meshWorldAabbMin(model.getResultMesh());
    const executor = new TransformExecutor(new GridSnap(true, 0.5));
    const initials = new Map<THREE.Object3D, THREE.Vector3>([[model.root, model.root.position.clone()]]);
    executor.applyAbsoluteTranslation([model.root], initials, new THREE.Vector3(1.2, 0, 0));
    model.root.updateMatrixWorld(true);
    const resultMinAfter = meshWorldAabbMin(model.getResultMesh());
    expect(model.root.position.x).toBeCloseTo(1.1, 5);
    expect(resultMinAfter.x - resultMinBefore.x).toBeCloseTo(1.0, 5);
  });

  it('keeps brushes parented under the solid root while the root moves', () => {
    const model = createSolidWithProtrudingSubtractive();
    const brush = model.getBrushes()[0]!;
    const localBefore = brush.mesh!.position.clone();
    const executor = new TransformExecutor(new GridSnap(true, 0.5));
    const initials = new Map<THREE.Object3D, THREE.Vector3>([[model.root, model.root.position.clone()]]);
    executor.applyAbsoluteTranslation([model.root], initials, new THREE.Vector3(1.2, 0, 0));
    expect(brush.mesh!.position.distanceTo(localBefore)).toBeLessThan(1e-8);
    expect(brush.mesh!.parent).toBe(model.root);
    expect(model.root.position.x).toBeCloseTo(1.0, 5);
  });
});
