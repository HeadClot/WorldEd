import * as THREE from 'three';

/** Equality epsilon for shared numeric fields. */
export const PANEL_PROPERTIES_VALUE_EPSILON = 1e-5;

/**
 * Returns whether all numbers in the list are equal within epsilon.
 *
 * @param values Numbers to compare.
 * @returns True when all values match.
 */
export function panelPropertiesAreValuesShared(values: number[]): boolean {
  if (values.length <= 1) {
    return true;
  }
  const first = values[0]!;
  return values.every((value) => Math.abs(value - first) <= PANEL_PROPERTIES_VALUE_EPSILON);
}

/**
 * Parses a UI text field into a finite number, or null when empty/invalid.
 *
 * @param text Input text.
 * @returns Parsed number or null.
 */
export function panelPropertiesParseOptionalNumber(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '' || trimmed === '—' || trimmed === '-') {
    return null;
  }
  const value = parseFloat(trimmed);
  if (isNaN(value)) {
    return null;
  }
  return value;
}

/**
 * Converts an Euler rotation to degrees for inspector display.
 *
 * @param rotation Euler rotation in radians.
 * @returns Vector of degrees.
 */
export function panelPropertiesEulerDegrees(rotation: THREE.Euler): THREE.Vector3 {
  return new THREE.Vector3(
    THREE.MathUtils.radToDeg(rotation.x),
    THREE.MathUtils.radToDeg(rotation.y),
    THREE.MathUtils.radToDeg(rotation.z),
  );
}

/**
 * Returns true when proposed positions match the given objects.
 *
 * @param objects Objects to compare.
 * @param positions Proposed positions.
 * @returns True when nothing would change.
 */
export function panelPropertiesAreObjectPositionsUnchanged(
  objects: readonly THREE.Object3D[],
  positions: readonly THREE.Vector3[],
): boolean {
  return objects.every((object, index) => {
    return object.position.distanceToSquared(positions[index]!) < 1e-12;
  });
}

/**
 * Returns true when proposed rotations match the given objects.
 *
 * @param objects Objects to compare.
 * @param rotations Proposed Euler rotations.
 * @returns True when nothing would change.
 */
export function panelPropertiesAreObjectRotationsUnchanged(
  objects: readonly THREE.Object3D[],
  rotations: readonly THREE.Euler[],
): boolean {
  return objects.every((object, index) => {
    const current = object.rotation;
    const next = rotations[index]!;
    return (
      Math.abs(current.x - next.x) < 1e-8 && Math.abs(current.y - next.y) < 1e-8 && Math.abs(current.z - next.z) < 1e-8
    );
  });
}

/**
 * Returns true when proposed scales match the given objects.
 *
 * @param objects Objects to compare.
 * @param scales Proposed scales.
 * @returns True when nothing would change.
 */
export function panelPropertiesAreObjectScalesUnchanged(
  objects: readonly THREE.Object3D[],
  scales: readonly THREE.Vector3[],
): boolean {
  return objects.every((object, index) => {
    return object.scale.distanceToSquared(scales[index]!) < 1e-12;
  });
}
