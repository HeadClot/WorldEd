import * as THREE from 'three';

/**
 * Finds the point on a finite world-space segment closest to a camera pick ray.
 * Used so edge hover markers sit under the pointer even under perspective
 * foreshortening (screen-space parameter is not the 3D segment parameter).
 *
 * @param segmentA Segment start in world space.
 * @param segmentB Segment end in world space.
 * @param rayOrigin Ray origin in world space.
 * @param rayDirection Ray direction in world space (need not be unit).
 * @param outPoint Optional vector for the closest point on the segment.
 * @returns Closest point on the segment (clamped to endpoints).
 */
export function closestPointOnSegmentToRay(
  segmentA: THREE.Vector3,
  segmentB: THREE.Vector3,
  rayOrigin: THREE.Vector3,
  rayDirection: THREE.Vector3,
  outPoint: THREE.Vector3 = new THREE.Vector3(),
): THREE.Vector3 {
  const parameter = closestParameterOnSegmentToRay(segmentA, segmentB, rayOrigin, rayDirection);
  return outPoint.copy(segmentA).lerp(segmentB, parameter);
}

/**
 * Returns the clamped parameter of the segment point nearest a pick ray.
 *
 * @param segmentA Segment start in world space.
 * @param segmentB Segment end in world space.
 * @param rayOrigin Ray origin in world space.
 * @param rayDirection Ray direction in world space (need not be unit).
 * @returns Parameter t in [0, 1] along A→B.
 */
export function closestParameterOnSegmentToRay(
  segmentA: THREE.Vector3,
  segmentB: THREE.Vector3,
  rayOrigin: THREE.Vector3,
  rayDirection: THREE.Vector3,
): number {
  const edgeX = segmentB.x - segmentA.x;
  const edgeY = segmentB.y - segmentA.y;
  const edgeZ = segmentB.z - segmentA.z;
  const edgeLengthSq = edgeX * edgeX + edgeY * edgeY + edgeZ * edgeZ;
  if (edgeLengthSq <= 1e-20) {
    return 0;
  }
  const rayLengthSq = rayDirection.lengthSq();
  if (rayLengthSq <= 1e-20) {
    return closestParameterOnSegmentToPoint(segmentA, edgeX, edgeY, edgeZ, edgeLengthSq, rayOrigin);
  }
  const originToA_x = segmentA.x - rayOrigin.x;
  const originToA_y = segmentA.y - rayOrigin.y;
  const originToA_z = segmentA.z - rayOrigin.z;
  const rayDotEdge = rayDirection.x * edgeX + rayDirection.y * edgeY + rayDirection.z * edgeZ;
  const rayDotOriginToA = rayDirection.x * originToA_x + rayDirection.y * originToA_y + rayDirection.z * originToA_z;
  const edgeDotOriginToA = edgeX * originToA_x + edgeY * originToA_y + edgeZ * originToA_z;
  const denominator = rayLengthSq * edgeLengthSq - rayDotEdge * rayDotEdge;
  let segmentParameter: number;
  if (Math.abs(denominator) < 1e-20) {
    segmentParameter = edgeDotOriginToA / edgeLengthSq;
  } else {
    segmentParameter = (rayDotEdge * rayDotOriginToA - rayLengthSq * edgeDotOriginToA) / denominator;
  }
  return Math.max(0, Math.min(1, segmentParameter));
}

/**
 * Clamped parameter of the closest point on a segment to a world point.
 *
 * @param segmentA Segment start.
 * @param edgeX Segment delta X.
 * @param edgeY Segment delta Y.
 * @param edgeZ Segment delta Z.
 * @param edgeLengthSq Squared segment length.
 * @param point Query point.
 * @returns Parameter t in [0, 1].
 */
function closestParameterOnSegmentToPoint(
  segmentA: THREE.Vector3,
  edgeX: number,
  edgeY: number,
  edgeZ: number,
  edgeLengthSq: number,
  point: THREE.Vector3,
): number {
  const toPointX = point.x - segmentA.x;
  const toPointY = point.y - segmentA.y;
  const toPointZ = point.z - segmentA.z;
  const t = (toPointX * edgeX + toPointY * edgeY + toPointZ * edgeZ) / edgeLengthSq;
  return Math.max(0, Math.min(1, t));
}
