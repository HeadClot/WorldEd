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
  // Update the solid root first — child updateMatrixWorld does not refresh parents.
  model.root.updateMatrixWorld(true);
  const mesh = model.getResultMesh();
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  return mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld).min;
}

/**
 * True when a value sits on the grid within a small epsilon.
 *
 * @param value Axis value.
 * @param interval Grid interval.
 * @returns True when snapped.
 */
function isOnGrid(value: number, interval: number): boolean {
  const scaled = value / interval;
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

describe('Bounds face move solid model snap', () => {
  it('snaps solid result bounds under free plane deltas (bounds body drag)', () => {
    const { model } = createSolidInWorld();
    const interval = 0.25;
    const executor = new TransformExecutor(new GridSnap(true, interval));
    const start = model.root.position.clone();
    const initials = new Map<THREE.Object3D, THREE.Vector3>([[model.root, start.clone()]]);
    // Simulate free bounds-face plane motion (X/Z) like face-drag totalDelta.
    // Without updating the root matrixWorld before measuring the result child,
    // snap used a stale pose and free drag stayed continuous.
    executor.applyAbsoluteTranslation([model.root], initials, new THREE.Vector3(0.37, 0, 0.19));
    const min = resultWorldMin(model);
    expect(isOnGrid(min.x, interval)).toBe(true);
    expect(isOnGrid(min.z, interval)).toBe(true);
  });

  it('keeps successive free-drag samples on the grid (no stale-matrix lag)', () => {
    const { model } = createSolidInWorld();
    const interval = 0.25;
    const executor = new TransformExecutor(new GridSnap(true, interval));
    const start = model.root.position.clone();
    const initials = new Map<THREE.Object3D, THREE.Vector3>([[model.root, start.clone()]]);
    const samples = [0.1, 0.2, 0.35, 0.5, 0.62, 0.8, 1.05];
    for (const sample of samples) {
      executor.applyAbsoluteTranslation([model.root], initials, new THREE.Vector3(sample, 0, sample * 0.5));
      const min = resultWorldMin(model);
      expect(isOnGrid(min.x, interval)).toBe(true);
      expect(isOnGrid(min.z, interval)).toBe(true);
    }
  });

  it('resolves solid result selection to the root for bounds drag targets', () => {
    const { model } = createSolidInWorld();
    const targets = resolveTransformTargets([model.getResultMesh()]);
    expect(targets).toEqual([model.root]);
  });
});
