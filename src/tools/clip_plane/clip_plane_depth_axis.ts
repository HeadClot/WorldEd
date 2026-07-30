import * as THREE from 'three';

/** Viewport and surface hints used to resolve a two-point clip depth axis. */
export interface ClipPlanePlacementHint {
  /** Camera look direction in world space (from camera into the scene). */
  cameraDirection: THREE.Vector3;
  /** World-space outward face normal when the point was picked on a mesh. */
  surfaceNormal: THREE.Vector3 | null;
  /** True when the pick came from an orthographic viewport. */
  isOrthographic: boolean;
}

/** Epsilon for rejecting near-zero depth vectors. */
const DEPTH_AXIS_EPSILON = 1e-10;

/**
 * Chooses the free axis for an underspecified two-point clip plane.
 * Orthographic picks follow camera depth (slice into the view). Perspective
 * surface picks follow the face normal (slice into the brush). Other picks fall
 * back to camera direction, then world up.
 *
 * @param hint Placement context from the active viewport and pick.
 * @returns Unit depth axis lying in the clip plane.
 */
export function resolveClipPlaneDepthAxis(hint: ClipPlanePlacementHint): THREE.Vector3 {
  if (hint.isOrthographic) {
    return normalizeOrFallback(hint.cameraDirection);
  }
  if (hint.surfaceNormal) {
    return normalizeOrFallback(hint.surfaceNormal, hint.cameraDirection);
  }
  return normalizeOrFallback(hint.cameraDirection);
}

/**
 * Builds a placement hint from a viewport camera and optional surface normal.
 *
 * @param camera Viewport camera used for the pick.
 * @param surfaceNormal World face normal, or null for ground/grid picks.
 * @returns Hint for depth-axis resolution.
 */
export function createClipPlanePlacementHint(
  camera: THREE.Camera,
  surfaceNormal: THREE.Vector3 | null,
): ClipPlanePlacementHint {
  const cameraDirection = new THREE.Vector3();
  camera.getWorldDirection(cameraDirection);
  return {
    cameraDirection,
    surfaceNormal: surfaceNormal ? surfaceNormal.clone() : null,
    isOrthographic: camera instanceof THREE.OrthographicCamera,
  };
}

/**
 * Normalizes a preferred axis, falling back through optional candidates and
 * world up when vectors are degenerate.
 *
 * @param preferred Preferred depth direction.
 * @param secondary Optional secondary candidate.
 * @returns Unit vector suitable as a plane depth axis.
 */
function normalizeOrFallback(preferred: THREE.Vector3, secondary?: THREE.Vector3): THREE.Vector3 {
  const primary = tryNormalize(preferred);
  if (primary) return primary;
  if (secondary) {
    const secondaryUnit = tryNormalize(secondary);
    if (secondaryUnit) return secondaryUnit;
  }
  return new THREE.Vector3(0, 1, 0);
}

/**
 * Returns a unit clone of the vector, or null when it is near zero.
 *
 * @param vector Candidate direction.
 * @returns Normalized clone, or null.
 */
function tryNormalize(vector: THREE.Vector3): THREE.Vector3 | null {
  if (vector.lengthSq() < DEPTH_AXIS_EPSILON) return null;
  return vector.clone().normalize();
}
