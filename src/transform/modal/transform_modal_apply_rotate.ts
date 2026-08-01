import * as THREE from 'three';
import { TransformExecutor } from '@/transform/core/transform_executor.js';
import { TransformProjectionMath } from '@/transform/core/transform_projection_math.js';
import { TransformModalAxis } from './transform_modal_axis.js';
import { transformModalAxisWorldVector } from './transform_modal_axis_vector.js';
import { transformModalNumericRotationRadians } from './transform_modal_numeric_delta.js';

/**
 * Applies a typed rotation (degrees) about a modal axis from pre-drag poses.
 *
 * @param executor Transform executor.
 * @param objects Drag targets.
 * @param initialPositions Pre-drag positions.
 * @param initialQuaternions Pre-drag rotations.
 * @param pivot World pivot.
 * @param valueDegrees Typed angle in degrees.
 * @param axis Effective single axis.
 * @param orientation Gizmo orientation.
 * @param outAngle Optional holder for applied radians.
 * @returns True when applied.
 */
export function transformModalApplyRotateNumeric(
  executor: TransformExecutor,
  objects: THREE.Object3D[],
  initialPositions: Map<THREE.Object3D, THREE.Vector3>,
  initialQuaternions: Map<THREE.Object3D, THREE.Quaternion>,
  pivot: THREE.Vector3,
  valueDegrees: number,
  axis: TransformModalAxis,
  orientation: THREE.Quaternion,
  outAngle?: { radians: number },
): boolean {
  const worldAxis = transformModalAxisWorldVector(axis, orientation);
  if (!worldAxis) {
    return false;
  }
  return transformModalApplyRotateAboutWorldAxis(
    executor,
    objects,
    initialPositions,
    initialQuaternions,
    pivot,
    valueDegrees,
    worldAxis,
    outAngle,
  );
}

/**
 * Applies a typed free rotation (degrees) about the camera view axis.
 *
 * @param executor Transform executor.
 * @param objects Drag targets.
 * @param initialPositions Pre-drag positions.
 * @param initialQuaternions Pre-drag rotations.
 * @param pivot World pivot.
 * @param valueDegrees Typed angle in degrees.
 * @param camera Active drag camera.
 * @param outAngle Optional holder for applied radians.
 * @returns True when applied.
 */
export function transformModalApplyRotateViewNumeric(
  executor: TransformExecutor,
  objects: THREE.Object3D[],
  initialPositions: Map<THREE.Object3D, THREE.Vector3>,
  initialQuaternions: Map<THREE.Object3D, THREE.Quaternion>,
  pivot: THREE.Vector3,
  valueDegrees: number,
  camera: THREE.Camera,
  outAngle?: { radians: number },
): boolean {
  const worldAxis = TransformProjectionMath.getCameraForwardDirection(camera);
  return transformModalApplyRotateAboutWorldAxis(
    executor,
    objects,
    initialPositions,
    initialQuaternions,
    pivot,
    valueDegrees,
    worldAxis,
    outAngle,
  );
}

/**
 * Applies a typed rotation about a known world axis.
 *
 * @param executor Transform executor.
 * @param objects Drag targets.
 * @param initialPositions Pre-drag positions.
 * @param initialQuaternions Pre-drag rotations.
 * @param pivot World pivot.
 * @param valueDegrees Typed angle in degrees.
 * @param worldAxis Unit world rotation axis.
 * @param outAngle Optional holder for applied radians.
 * @returns True when applied.
 */
function transformModalApplyRotateAboutWorldAxis(
  executor: TransformExecutor,
  objects: THREE.Object3D[],
  initialPositions: Map<THREE.Object3D, THREE.Vector3>,
  initialQuaternions: Map<THREE.Object3D, THREE.Quaternion>,
  pivot: THREE.Vector3,
  valueDegrees: number,
  worldAxis: THREE.Vector3,
  outAngle?: { radians: number },
): boolean {
  const radians = transformModalNumericRotationRadians(valueDegrees);
  executor.applyAbsoluteRotation(objects, initialPositions, initialQuaternions, pivot, worldAxis, radians);
  if (outAngle) {
    outAngle.radians = radians;
  }
  return true;
}
