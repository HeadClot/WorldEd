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
  // Prefer updating from the solid root so parent matrixWorld is current.
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
  it('snaps the solid result surface to the grid, not the brush-hull union', () => {
    const model = createSolidWithProtrudingSubtractive();
    const world = new THREE.Group();
    world.add(model.root);
    const executor = new TransformExecutor(new GridSnap(true, 0.25));
    const start = model.root.position.clone();
    const initials = new Map<THREE.Object3D, THREE.Vector3>([[model.root, start.clone()]]);
    executor.applyAbsoluteTranslation([model.root], initials, new THREE.Vector3(0.11, 0, 0));
    const resultMin = meshWorldAabbMin(model.getResultMesh());
    expect(resultMin.x % 0.25).toBeCloseTo(0, 5);
    model.root.updateMatrixWorld(true);
    const hierarchyBox = new THREE.Box3().setFromObject(model.root);
    const resultMesh = model.getResultMesh();
    if (!resultMesh.geometry.boundingBox) resultMesh.geometry.computeBoundingBox();
    const resultMax = resultMesh.geometry.boundingBox!.clone().applyMatrix4(resultMesh.matrixWorld).max;
    // Hierarchy includes the protruding subtractive hull on +X; result CSG max
    // is smaller. Snap is driven by the result surface, not the hull union.
    expect(hierarchyBox.max.x - resultMax.x).toBeGreaterThan(0.01);
  });

  it('keeps brushes parented under the solid root while the root snaps', () => {
    const model = createSolidWithProtrudingSubtractive();
    const brush = model.getBrushes()[0]!;
    const localBefore = brush.mesh!.position.clone();
    const executor = new TransformExecutor(new GridSnap(true, 0.5));
    const initials = new Map<THREE.Object3D, THREE.Vector3>([[model.root, model.root.position.clone()]]);
    executor.applyAbsoluteTranslation([model.root], initials, new THREE.Vector3(1.2, 0, 0));
    expect(brush.mesh!.position.distanceTo(localBefore)).toBeLessThan(1e-8);
    expect(brush.mesh!.parent).toBe(model.root);
    expect(model.root.position.x).not.toBeCloseTo(0, 5);
  });
});
