import * as THREE from 'three';

/** Epsilon used when testing collinear or parallel point sets. */
const PLANE_POINT_EPSILON = 1e-8;

/** Default world up used when no depth axis is supplied for two-point planes. */
const DEFAULT_WORLD_UP = new THREE.Vector3(0, 1, 0);

/**
 * Builds a vertical clipping plane through two world points. The plane contains
 * both points and is parallel to world up when possible.
 *
 * @param pointA First world-space point on the plane.
 * @param pointB Second world-space point on the plane.
 * @param worldUp Preferred up axis (defaults to +Y).
 * @returns A plane, or null when the points are too close or degenerate.
 */
export function buildVerticalPlaneFromTwoPoints(
  pointA: THREE.Vector3,
  pointB: THREE.Vector3,
  worldUp: THREE.Vector3 = DEFAULT_WORLD_UP,
): THREE.Plane | null {
  return buildPlaneFromTwoPointsAndDepth(pointA, pointB, worldUp);
}

/**
 * Builds a two-point plane that contains both points and the depth axis. Used
 * for view-aware or surface-aware clip cuts (depth is camera look or face
 * normal). Falls back when edge and depth are parallel.
 *
 * @param pointA First world-space point on the plane.
 * @param pointB Second world-space point on the plane.
 * @param depthAxis Direction lying in the plane (into the view or into the
 *   brush).
 * @returns A plane, or null when the points are too close or fully degenerate.
 */
export function buildPlaneFromTwoPointsAndDepth(
  pointA: THREE.Vector3,
  pointB: THREE.Vector3,
  depthAxis: THREE.Vector3,
): THREE.Plane | null {
  const edge = new THREE.Vector3().subVectors(pointB, pointA);
  if (edge.lengthSq() < PLANE_POINT_EPSILON) return null;
  const normal = computePlaneNormalFromEdgeAndDepth(edge, depthAxis);
  if (normal.lengthSq() < PLANE_POINT_EPSILON) return null;
  normal.normalize();
  return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, pointA);
}

/**
 * Builds an arbitrary plane from three non-collinear world points.
 *
 * @param pointA First point on the plane.
 * @param pointB Second point on the plane.
 * @param pointC Third point on the plane.
 * @returns A plane, or null when the points are collinear or coincident.
 */
export function buildPlaneFromThreePoints(
  pointA: THREE.Vector3,
  pointB: THREE.Vector3,
  pointC: THREE.Vector3,
): THREE.Plane | null {
  const ab = new THREE.Vector3().subVectors(pointB, pointA);
  const ac = new THREE.Vector3().subVectors(pointC, pointA);
  if (ab.lengthSq() < PLANE_POINT_EPSILON) return null;
  if (ac.lengthSq() < PLANE_POINT_EPSILON) return null;
  const normal = new THREE.Vector3().crossVectors(ab, ac);
  if (normal.lengthSq() < PLANE_POINT_EPSILON) return null;
  normal.normalize();
  return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, pointA);
}

/**
 * Builds a plane from two or three placement points. Two points use the depth
 * axis (camera or surface) when provided, otherwise a vertical fallback. Three
 * points use free orientation and ignore depth.
 *
 * @param points Ordered world points (length 2 or 3).
 * @param depthAxis Optional free axis for the two-point case.
 * @returns A plane, or null when the set is invalid.
 */
export function buildPlaneFromPlacementPoints(
  points: THREE.Vector3[],
  depthAxis?: THREE.Vector3 | null,
): THREE.Plane | null {
  if (points.length >= 3) {
    return buildPlaneFromThreePoints(points[0]!, points[1]!, points[2]!);
  }
  if (points.length === 2) {
    const axis = depthAxis && depthAxis.lengthSq() >= PLANE_POINT_EPSILON ? depthAxis : DEFAULT_WORLD_UP;
    return buildPlaneFromTwoPointsAndDepth(points[0]!, points[1]!, axis);
  }
  return null;
}

/**
 * Returns a plane with inverted normal and constant (swaps half-spaces).
 *
 * @param plane The source plane.
 * @returns A new flipped plane.
 */
export function flipPlane(plane: THREE.Plane): THREE.Plane {
  return new THREE.Plane(plane.normal.clone().negate(), -plane.constant);
}

/**
 * Converts a Three.js plane to the CSG clipper form n·x = constant. Three.js
 * stores n·x + constant = 0, so CSG constant is -plane.constant.
 *
 * @param plane The Three.js plane.
 * @returns Normal and plane constant for CsgClipper.
 */
export function planeToCsgForm(plane: THREE.Plane): { normal: THREE.Vector3; constant: number } {
  return {
    normal: plane.normal.clone().normalize(),
    constant: -plane.constant,
  };
}

/**
 * Chooses a plane normal from the placement edge and preferred depth axis.
 *
 * @param edge Direction between the two placement points.
 * @param depthAxis Preferred direction lying in the plane.
 * @returns Unnormalized normal, or zero if fully degenerate.
 */
function computePlaneNormalFromEdgeAndDepth(edge: THREE.Vector3, depthAxis: THREE.Vector3): THREE.Vector3 {
  const primary = new THREE.Vector3().crossVectors(edge, depthAxis);
  if (primary.lengthSq() >= PLANE_POINT_EPSILON) {
    return primary;
  }
  const worldUpFallback = new THREE.Vector3().crossVectors(edge, DEFAULT_WORLD_UP);
  if (worldUpFallback.lengthSq() >= PLANE_POINT_EPSILON) {
    return worldUpFallback;
  }
  return new THREE.Vector3().crossVectors(edge, pickFallbackAxis(edge));
}

/**
 * Picks a fallback axis when edge is nearly parallel to world up.
 *
 * @param edge Edge direction.
 * @returns A unit axis not parallel to the edge.
 */
function pickFallbackAxis(edge: THREE.Vector3): THREE.Vector3 {
  const absX = Math.abs(edge.x);
  const absZ = Math.abs(edge.z);
  if (absX < absZ) {
    return new THREE.Vector3(1, 0, 0);
  }
  return new THREE.Vector3(0, 0, 1);
}
