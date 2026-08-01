import * as THREE from 'three';
import { TransformMode } from '@/types/transform_mode.js';
import { TransformModalAxis } from './transform_modal_axis.js';
import { transformModalAxisWorldVector } from './transform_modal_axis_vector.js';

/**
 * Builds a world translation delta from a typed numeric value and axis.
 *
 * @param value Typed scalar distance.
 * @param axis Effective single axis (must be locked).
 * @param orientation Gizmo world orientation.
 * @returns World delta, or null when axis is missing.
 */
export function transformModalNumericTranslationDelta(
  value: number,
  axis: TransformModalAxis,
  orientation: THREE.Quaternion,
): THREE.Vector3 | null {
  const worldAxis = transformModalAxisWorldVector(axis, orientation);
  if (!worldAxis) {
    return null;
  }
  return worldAxis.multiplyScalar(value);
}

/**
 * Converts a typed rotate value (degrees) into radians.
 *
 * @param degrees Typed angle in degrees.
 * @returns Angle in radians.
 */
export function transformModalNumericRotationRadians(degrees: number): number {
  return THREE.MathUtils.degToRad(degrees);
}

/**
 * Returns the scale factor for a typed numeric scale value.
 *
 * @param value Typed scale factor.
 * @returns Clamped positive scale factor.
 */
export function transformModalNumericScaleFactor(value: number): number {
  return Math.max(0.01, Math.abs(value));
}

/**
 * Returns whether the transform mode uses degrees for typed numbers.
 *
 * @param mode Active transform mode.
 * @returns True for rotate mode.
 */
export function transformModalNumericUsesDegrees(mode: TransformMode): boolean {
  return mode === TransformMode.ROTATE;
}
