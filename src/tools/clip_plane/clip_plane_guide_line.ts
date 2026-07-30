import * as THREE from 'three';

/** Default multiplier for extending past the placement segment. */
const DEFAULT_EXTEND_FACTOR = 3;

/** Minimum half-length so a short placement still reads as a full cut. */
const DEFAULT_MIN_HALF_LENGTH = 1.5;

/**
 * Builds an extended guide line through the first two clip placement points.
 * Pure O(1) — used so edge-on planes remain visible in orthographic views.
 *
 * @param points Placement points (needs at least two).
 * @param extendFactor How far past each endpoint to extend, as a multiple of
 *   half-length.
 * @param minHalfLength Floor for half-length when points are very close.
 * @returns Start and end of the guide segment, or null when invalid.
 */
export function buildExtendedClipGuideLine(
  points: readonly THREE.Vector3[],
  extendFactor: number = DEFAULT_EXTEND_FACTOR,
  minHalfLength: number = DEFAULT_MIN_HALF_LENGTH,
): { start: THREE.Vector3; end: THREE.Vector3 } | null {
  if (points.length < 2) return null;
  const pointA = points[0]!;
  const pointB = points[1]!;
  const direction = new THREE.Vector3().subVectors(pointB, pointA);
  const length = direction.length();
  if (length < 1e-8) return null;
  direction.multiplyScalar(1 / length);
  const halfLength = Math.max(length * 0.5, minHalfLength);
  const extension = halfLength * extendFactor;
  const mid = new THREE.Vector3().addVectors(pointA, pointB).multiplyScalar(0.5);
  return {
    start: mid.clone().addScaledVector(direction, -extension),
    end: mid.clone().addScaledVector(direction, extension),
  };
}
