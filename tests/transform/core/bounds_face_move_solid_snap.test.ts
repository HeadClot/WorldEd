import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { TransformExecutor } from '@/transform/core/transform_executor.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { resolveTransformTargets } from '@/selection/object/resolve_transform_targets.js';

/**
 * Builds a solid model with one additive box ready for bounds move tests.
 *
 * @returns Solid model under a world group.
 */
function createSolidInWorld(): { model: SolidModel; world: THREE.Group } {
  const world = new THREE.Group();
  const model = new SolidModel('BoundsMoveSolid');
  model.addBoxBrush(2, SolidOperation.Additive);
  world.add(model.root);
  return { model, world };
}

/**
 * Returns world AABB min of the solid result mesh.
 *
 * @param model Solid model.
 * @returns World min corner.
 */
function resultWorldMin(model: SolidModel): THREE.Vector3 {
  model.root.updateMatrixWorld(true);
  const mesh = model.getResultMesh();
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  return mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld).min;
}

describe('Bounds face move solid model snap', () => {
  it('snaps free plane deltas as relative grid steps for bounds body drag', () => {
    const { model } = createSolidInWorld();
    model.root.position.set(0.13, 0, 0.07);
    const interval = 0.25;
    const executor = new TransformExecutor(new GridSnap(true, interval));
    const start = model.root.position.clone();
    const minBefore = resultWorldMin(model);
    const initials = new Map<THREE.Object3D, THREE.Vector3>([[model.root, start.clone()]]);
    executor.applyAbsoluteTranslation([model.root], initials, new THREE.Vector3(0.37, 0, 0.19));
    const minAfter = resultWorldMin(model);
    expect(model.root.position.x).toBeCloseTo(0.38, 5);
    expect(model.root.position.z).toBeCloseTo(0.32, 5);
    expect(minAfter.x - minBefore.x).toBeCloseTo(0.25, 5);
    expect(minAfter.z - minBefore.z).toBeCloseTo(0.25, 5);
  });

  it('keeps successive free-drag samples on relative grid steps', () => {
    const { model } = createSolidInWorld();
    model.root.position.set(0.13, 0, 0.07);
    const interval = 0.25;
    const executor = new TransformExecutor(new GridSnap(true, interval));
    const start = model.root.position.clone();
    const initials = new Map<THREE.Object3D, THREE.Vector3>([[model.root, start.clone()]]);
    const samples = [
      { delta: 0.1, expectedRootX: 0.13 },
      { delta: 0.2, expectedRootX: 0.38 },
      { delta: 0.35, expectedRootX: 0.38 },
      { delta: 0.5, expectedRootX: 0.63 },
      { delta: 0.62, expectedRootX: 0.63 },
      { delta: 0.8, expectedRootX: 0.88 },
      { delta: 1.05, expectedRootX: 1.13 },
    ];
    for (const sample of samples) {
      executor.applyAbsoluteTranslation([model.root], initials, new THREE.Vector3(sample.delta, 0, sample.delta * 0.5));
      expect(model.root.position.x).toBeCloseTo(sample.expectedRootX, 5);
      expect(model.root.position.z).toBeCloseTo(start.z + Math.round((sample.delta * 0.5) / interval) * interval, 5);
    }
  });

  it('resolves solid result selection to the root for bounds drag targets', () => {
    const { model } = createSolidInWorld();
    const targets = resolveTransformTargets([model.getResultMesh()]);
    expect(targets).toEqual([model.root]);
  });
});
