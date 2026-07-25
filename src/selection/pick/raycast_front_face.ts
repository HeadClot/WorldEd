import * as THREE from 'three';

/**
 * Returns whether a triangle intersection faces the ray origin (front face).
 * Front-facing means the world-space face normal points against the ray
 * direction, matching typical front-face culling for camera rays.
 *
 * @param hit Raycast intersection that may include a triangle face.
 * @param rayDirection World-space ray direction (unit or non-unit).
 * @param scratchNormal Reusable vector for the transformed face normal.
 * @param scratchNormalMatrix Reusable matrix for object normal transform.
 * @returns True when the hit is a front face; false for back faces or missing
 *   data.
 */
export function isIntersectionFrontFacing(
  hit: THREE.Intersection,
  rayDirection: THREE.Vector3,
  scratchNormal: THREE.Vector3 = new THREE.Vector3(),
  scratchNormalMatrix: THREE.Matrix3 = new THREE.Matrix3(),
): boolean {
  if (!hit.face) {
    return false;
  }
  scratchNormalMatrix.getNormalMatrix(hit.object.matrixWorld);
  scratchNormal.copy(hit.face.normal).applyMatrix3(scratchNormalMatrix).normalize();
  return scratchNormal.dot(rayDirection) < 0;
}
