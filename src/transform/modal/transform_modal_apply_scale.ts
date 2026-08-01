import * as THREE from 'three';
import { GizmoAxis } from '@/types/transform_mode.js';
import { TransformExecutor } from '@/transform/core/transform_executor.js';
import { freeScaleAxisFactors } from '@/transform/core/free_scale_axis_factors.js';
import { TransformModalAxis } from './transform_modal_axis.js';
import { transformModalAxisToGizmoAxis } from './transform_modal_effective_axis.js';
import { transformModalAxisWorldVector } from './transform_modal_axis_vector.js';
import { transformModalNumericScaleFactor } from './transform_modal_numeric_delta.js';

/**
 * Applies a typed scale factor along a modal axis from pre-drag poses.
 *
 * @param executor Transform executor.
 * @param objects Drag targets.
 * @param initialPositions Pre-drag positions.
 * @param initialScales Pre-drag scales.
 * @param pivot World pivot.
 * @param value Typed scale factor.
 * @param axis Effective single axis.
 * @param orientation Gizmo orientation.
 * @param outFactor Optional holder for applied factor.
 * @returns True when applied.
 */
export function transformModalApplyScaleNumeric(
  executor: TransformExecutor,
  objects: THREE.Object3D[],
  initialPositions: Map<THREE.Object3D, THREE.Vector3>,
  initialScales: Map<THREE.Object3D, THREE.Vector3>,
  pivot: THREE.Vector3,
  value: number,
  axis: TransformModalAxis,
  orientation: THREE.Quaternion,
  outFactor?: { factor: number },
): boolean {
  const worldAxis = transformModalAxisWorldVector(axis, orientation);
  const gizmoAxis = transformModalAxisToGizmoAxis(axis);
  if (!worldAxis || !gizmoAxis) {
    return false;
  }
  const factor = transformModalNumericScaleFactor(value);
  executor.applyAbsoluteScale(
    objects,
    initialPositions,
    initialScales,
    pivot,
    worldAxis,
    factor,
    gizmoAxis as GizmoAxis,
  );
  if (outFactor) {
    outFactor.factor = factor;
  }
  return true;
}

/**
 * Applies a typed free (uniform or planar) scale factor from pre-drag poses.
 *
 * @param executor Transform executor.
 * @param objects Drag targets.
 * @param initialPositions Pre-drag positions.
 * @param initialScales Pre-drag scales.
 * @param pivot World pivot.
 * @param value Typed scale factor.
 * @param camera Active drag camera, or null.
 * @param forceUniformThreeAxes True for single-use free S.
 * @param outFactor Optional holder for applied factor.
 * @returns True when applied.
 */
export function transformModalApplyScaleFreeNumeric(
  executor: TransformExecutor,
  objects: THREE.Object3D[],
  initialPositions: Map<THREE.Object3D, THREE.Vector3>,
  initialScales: Map<THREE.Object3D, THREE.Vector3>,
  pivot: THREE.Vector3,
  value: number,
  camera: THREE.Camera | null,
  forceUniformThreeAxes: boolean,
  outFactor?: { factor: number },
): boolean {
  const factor = transformModalNumericScaleFactor(value);
  const axisFactors = freeScaleAxisFactors(factor, camera, forceUniformThreeAxes);
  executor.applyAbsoluteFreeScale(objects, initialPositions, initialScales, pivot, axisFactors);
  if (outFactor) {
    outFactor.factor = factor;
  }
  return true;
}
