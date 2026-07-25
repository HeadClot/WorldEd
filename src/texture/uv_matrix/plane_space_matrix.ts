import * as THREE from 'three';

/**
 * Builds an orthonormal tangent/binormal pair for a unit plane normal using a
 * stable world-axis seed (largest orthogonal axis).
 *
 * @param normal Unit plane normal.
 * @returns Tangent and binormal unit vectors.
 */
export function buildPlaneTangents(normal: THREE.Vector3): {
  tangent: THREE.Vector3;
  binormal: THREE.Vector3;
} {
  const unitNormal = normal.clone().normalize();
  const seed = closestAxisOrthogonalTo(unitNormal);
  const tangent = new THREE.Vector3().crossVectors(unitNormal, seed).normalize();
  const binormal = new THREE.Vector3().crossVectors(unitNormal, tangent).normalize();
  return { tangent, binormal };
}

/**
 * Builds a matrix that maps positions from local space into plane space where X
 * = tangent, Y = binormal, Z = normal, origin on the plane.
 *
 * @param normal Unit plane normal.
 * @param planeOffset Plane offset d in ax+by+cz+d = 0 form.
 * @returns Local-to-plane 4×4 matrix.
 */
export function buildLocalToPlaneMatrix(normal: THREE.Vector3, planeOffset: number): THREE.Matrix4 {
  const unitNormal = normal.clone().normalize();
  const { tangent, binormal } = buildPlaneTangents(unitNormal);
  const pointOnPlane = unitNormal.clone().multiplyScalar(-planeOffset);
  const matrix = new THREE.Matrix4();
  matrix.set(
    tangent.x,
    tangent.y,
    tangent.z,
    -tangent.dot(pointOnPlane),
    binormal.x,
    binormal.y,
    binormal.z,
    -binormal.dot(pointOnPlane),
    unitNormal.x,
    unitNormal.y,
    unitNormal.z,
    -unitNormal.dot(pointOnPlane),
    0,
    0,
    0,
    1,
  );
  return matrix;
}

/**
 * Converts a world-space transform into plane-space form for UV matrix updates:
 * planeSpace = localToPlane * worldTransform * planeToLocal.
 *
 * @param worldTransform Transform applied to world (or local) positions.
 * @param normal Unit plane normal in the same space as the transform domain.
 * @param planeOffset Plane offset d in that space.
 * @returns Plane-space 4×4 transform.
 */
export function worldTransformToPlaneSpace(
  worldTransform: THREE.Matrix4,
  normal: THREE.Vector3,
  planeOffset: number,
): THREE.Matrix4 {
  const localToPlane = buildLocalToPlaneMatrix(normal, planeOffset);
  const planeToLocal = localToPlane.clone().invert();
  return localToPlane.clone().multiply(worldTransform).multiply(planeToLocal);
}

/**
 * Picks the world axis most orthogonal to the given normal.
 *
 * @param normal Unit normal.
 * @returns Axis seed vector.
 */
function closestAxisOrthogonalTo(normal: THREE.Vector3): THREE.Vector3 {
  const absX = Math.abs(normal.x);
  const absY = Math.abs(normal.y);
  const absZ = Math.abs(normal.z);
  if (absY >= absX && absY >= absZ) {
    return new THREE.Vector3(1, 0, 0);
  }
  if (absX >= absY && absX >= absZ) {
    return new THREE.Vector3(0, 0, 1);
  }
  return new THREE.Vector3(1, 0, 0);
}
