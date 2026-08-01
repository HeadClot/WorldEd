import * as THREE from 'three';
import { GizmoAxis } from '@/types/transform_mode.js';
import { TransformModalAxis } from './transform_modal_axis.js';
import { transformModalAxisWorldVector } from './transform_modal_axis_vector.js';
import { TransformProjectionMath } from '@/transform/core/transform_projection_math.js';

/**
 * Constrains a world-space translation delta by keyboard modal axis when set,
 * otherwise by the active gizmo handle axis/plane.
 *
 * @param delta Full unsnapped world delta.
 * @param modalAxis Keyboard axis lock.
 * @param handleAxis Active gizmo handle axis.
 * @param orientation Gizmo world orientation.
 * @returns Constrained world delta.
 */
export function transformModalConstrainTranslationDelta(
  delta: THREE.Vector3,
  modalAxis: TransformModalAxis,
  handleAxis: GizmoAxis | null,
  orientation: THREE.Quaternion,
): THREE.Vector3 {
  if (modalAxis !== TransformModalAxis.None) {
    return transformModalProjectDeltaOntoModalAxis(delta, modalAxis, orientation);
  }
  if (!handleAxis) {
    return delta.clone();
  }
  return transformModalProjectDeltaOntoHandleAxis(delta, handleAxis, orientation);
}

/**
 * Projects a delta onto a keyboard-locked modal axis.
 *
 * @param delta Full world delta.
 * @param modalAxis Locked modal axis.
 * @param orientation Gizmo world orientation.
 * @returns Projected delta.
 */
function transformModalProjectDeltaOntoModalAxis(
  delta: THREE.Vector3,
  modalAxis: TransformModalAxis,
  orientation: THREE.Quaternion,
): THREE.Vector3 {
  const worldAxis = transformModalAxisWorldVector(modalAxis, orientation);
  if (!worldAxis) {
    return new THREE.Vector3(0, 0, 0);
  }
  return worldAxis.multiplyScalar(delta.dot(worldAxis));
}

/**
 * Projects a delta onto the active gizmo handle axis or plane.
 *
 * @param delta Full world delta.
 * @param handleAxis Active gizmo handle axis.
 * @param orientation Gizmo world orientation.
 * @returns Projected delta.
 */
function transformModalProjectDeltaOntoHandleAxis(
  delta: THREE.Vector3,
  handleAxis: GizmoAxis,
  orientation: THREE.Quaternion,
): THREE.Vector3 {
  if (handleAxis === GizmoAxis.VIEW) {
    return delta.clone();
  }
  if (handleAxis === GizmoAxis.X || handleAxis === GizmoAxis.Y || handleAxis === GizmoAxis.Z) {
    const worldAxis = TransformProjectionMath.axisToWorldVector(handleAxis, orientation);
    return worldAxis.multiplyScalar(delta.dot(worldAxis));
  }
  return TransformProjectionMath.constrainDelta(delta, handleAxis);
}
