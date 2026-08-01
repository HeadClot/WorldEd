import * as THREE from 'three';
import { TransformExecutor } from '@/transform/core/transform_executor.js';
import { TransformModalAxis } from './transform_modal_axis.js';
import { transformModalNumericTranslationDelta } from './transform_modal_numeric_delta.js';

/**
 * Applies a typed translation distance along a modal axis from pre-drag poses.
 *
 * @param executor Transform executor.
 * @param objects Drag targets.
 * @param initialPositions Pre-drag positions.
 * @param value Typed distance.
 * @param axis Effective single axis.
 * @param orientation Gizmo orientation.
 * @param outDelta Optional vector to receive the applied world delta.
 * @returns True when applied.
 */
export function transformModalApplyTranslateNumeric(
  executor: TransformExecutor,
  objects: THREE.Object3D[],
  initialPositions: Map<THREE.Object3D, THREE.Vector3>,
  value: number,
  axis: TransformModalAxis,
  orientation: THREE.Quaternion,
  outDelta?: THREE.Vector3,
): boolean {
  const delta = transformModalNumericTranslationDelta(value, axis, orientation);
  if (!delta) {
    return false;
  }
  executor.applyAbsoluteTranslation(objects, initialPositions, delta);
  outDelta?.copy(delta);
  return true;
}
