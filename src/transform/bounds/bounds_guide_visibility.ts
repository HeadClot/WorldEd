import * as THREE from 'three';
import { getCadViewPlaneAxes, type CadLocalAxis, type CadViewPlane } from '../../rulers/cad_view_plane.js';

/** Local axis of a bounds corner guide ray. */
export type BoundsGuideAxis = 'x' | 'y' | 'z';

/** World Y of the perspective construction grid plane. */
export const BOUNDS_GUIDE_GROUND_PLANE_Y = 0;

/**
 * Inclusive slack for ground-plane and ray-end tests so float noise at segment
 * endpoints does not flicker guide visibility.
 */
export const BOUNDS_GUIDE_HIT_EPSILON = 0.02;

/**
 * Radial thickness for geometry tests. Multiple offset samples fight coplanar
 * float misses after duplicate/snap moves along an axis.
 */
export const BOUNDS_GUIDE_RAY_THICKNESS = 0.04;

/**
 * Extra far distance for geometry tests so near-miss hits at the tip stay
 * stable.
 */
export const BOUNDS_GUIDE_RAYCAST_FAR_PADDING = 0.02;

/** Result of resolving whether a guide ray draws and how far. */
export interface BoundsGuideRayResolution {
  /** True when the ray should appear. */
  show: boolean;
  /** Draw length along the ray (geometry preferred over ground). */
  drawLength: number;
}

/**
 * Returns whether a guide axis should be drawn in a viewport. Top (`xz`): X and
 * Z only. Front (`xy`): X and Y only. Side (`yz`): Y and Z only. Perspective
 * allows all three.
 *
 * @param axis Guide ray axis (local bounds RGB axes, world-aligned for
 *   multi-select).
 * @param viewPlane Viewport plane (`xyz` for perspective).
 * @returns True when the axis is allowed in that view.
 */
export function isBoundsGuideAxisDrawnInView(axis: BoundsGuideAxis, viewPlane: CadViewPlane): boolean {
  if (viewPlane === 'xyz') return true;
  if (viewPlane === 'xz') return axis === 'x' || axis === 'z';
  if (viewPlane === 'xy') return axis === 'x' || axis === 'y';
  if (viewPlane === 'yz') return axis === 'y' || axis === 'z';
  return true;
}

/**
 * Returns whether a world-space ray direction lies in the view plane enough to
 * draw. Depth-axis rays (e.g. pure Y in top view) are rejected.
 *
 * @param direction Unit world direction.
 * @param viewPlane Viewport plane.
 * @returns False when the ray is primarily along the hidden depth axis.
 */
export function isGuideWorldDirectionInViewPlane(direction: THREE.Vector3, viewPlane: CadViewPlane): boolean {
  const { depthAxis } = getCadViewPlaneAxes(viewPlane);
  if (depthAxis === null) return true;
  return Math.abs(direction.getComponent(depthAxis)) < 0.75;
}

/**
 * Returns the distance to the ground plane along a ray, or null when missed.
 * Contact / coplanar starts (already on the plane within epsilon) are ignored
 * so horizontal guides still reach the next surface instead of drawing length
 * 0.
 *
 * @param origin Ray origin in world space.
 * @param direction Unit ray direction in world space.
 * @param length Maximum ray length.
 * @param planeY World Y of the ground plane.
 * @returns Hit distance clamped to the segment, or null.
 */
export function findGuideRayGroundHitDistance(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  length: number,
  planeY: number = BOUNDS_GUIDE_GROUND_PLANE_Y,
): number | null {
  if (length <= 0) return null;
  // Horizontal (or near-horizontal) rays never use the ground as a clip target.
  if (Math.abs(direction.y) < BOUNDS_GUIDE_HIT_EPSILON) {
    return null;
  }
  const travel = (planeY - origin.y) / direction.y;
  // Already sitting on the plane — skip so callers can use a farther hit.
  if (travel <= BOUNDS_GUIDE_HIT_EPSILON || travel > length + BOUNDS_GUIDE_HIT_EPSILON) {
    return null;
  }
  return clampRayDistance(travel, length);
}

/**
 * Returns whether a finite ray segment intersects the horizontal grid plane.
 *
 * @param origin Ray origin in world space.
 * @param direction Unit ray direction in world space.
 * @param length Ray length.
 * @param planeY World Y of the ground plane.
 * @returns True when the segment touches the plane.
 */
export function doesGuideRayHitGroundPlane(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  length: number,
  planeY: number = BOUNDS_GUIDE_GROUND_PLANE_Y,
): boolean {
  return findGuideRayGroundHitDistance(origin, direction, length, planeY) !== null;
}

/**
 * Builds world-space AABBs for planar guide tests. Call once per bounds update
 * and reuse across orthographic viewports.
 *
 * @param meshes Content meshes to bound.
 * @returns World AABBs for fast 2D prism tests.
 */
export function buildGuideRaycastWorldBoxes(meshes: readonly THREE.Mesh[]): THREE.Box3[] {
  const boxes: THREE.Box3[] = [];
  for (const mesh of meshes) {
    const box = computeMeshWorldBox(mesh);
    if (box) boxes.push(box);
  }
  return boxes;
}

/**
 * Returns the closest geometry hit distance along a thickened 3D ray, or null.
 * Hits at or within contact epsilon (already touching a surface) are skipped so
 * the guide continues to the next solid along the ray.
 *
 * @param origin Ray origin in world space.
 * @param direction Unit ray direction in world space.
 * @param length Maximum ray length.
 * @param meshes Candidate content meshes.
 * @returns Closest positive hit distance beyond contact, or null.
 */
export function findGuideRayMeshHitDistance(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  length: number,
  meshes: readonly THREE.Mesh[],
): number | null {
  if (length <= 0 || meshes.length === 0) return null;
  const targets = [...meshes];
  const far = length + BOUNDS_GUIDE_RAYCAST_FAR_PADDING;
  let closest: number | null = null;
  for (const sampleOrigin of buildThickRayOrigins(origin, direction, BOUNDS_GUIDE_RAY_THICKNESS)) {
    // near = contact epsilon skips coplanar / already-touching starts.
    const raycaster = new THREE.Raycaster(sampleOrigin, direction, BOUNDS_GUIDE_HIT_EPSILON, far);
    const hits = raycaster.intersectObjects(targets, false);
    for (const hit of hits) {
      const distance = hit.distance;
      if (typeof distance !== 'number' || !Number.isFinite(distance)) continue;
      if (distance <= BOUNDS_GUIDE_HIT_EPSILON) continue;
      if (closest === null || distance < closest) {
        closest = distance;
      }
      break;
    }
  }
  if (closest === null) return null;
  return clampRayDistance(closest, length);
}

/**
 * Returns the closest planar (2D) hit distance against world AABBs, ignoring
 * the view depth axis so stacked objects still count as touching in
 * top/front/side.
 *
 * @param origin Ray origin in world space.
 * @param direction Unit ray direction in world space.
 * @param length Maximum ray length.
 * @param worldBoxes Precomputed world AABBs.
 * @param viewPlane Orthographic view plane.
 * @returns Closest hit distance, or null.
 */
export function findGuideRayPlanarHitDistance(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  length: number,
  worldBoxes: readonly THREE.Box3[],
  viewPlane: CadViewPlane,
): number | null {
  if (length <= 0 || worldBoxes.length === 0 || viewPlane === 'xyz') return null;
  const planeAxes = getInPlaneAxisIndices(viewPlane);
  if (!planeAxes) return null;
  let closest: number | null = null;
  for (const box of worldBoxes) {
    // Zero padding: draw length must reach the exact planar silhouette (same
    // as 3D mesh hits). Expansion here used to stop guides a few units early.
    const distance = rayHitDistanceOnPlaneAxes(origin, direction, length, box, planeAxes.axisA, planeAxes.axisB, 0);
    if (distance === null) continue;
    if (closest === null || distance < closest) {
      closest = distance;
    }
  }
  return closest;
}

/**
 * Returns the two world axis indices that form an orthographic view plane.
 *
 * @param viewPlane Orthographic plane.
 * @returns Axis pair, or null for perspective.
 */
export function getInPlaneAxisIndices(viewPlane: CadViewPlane): { axisA: CadLocalAxis; axisB: CadLocalAxis } | null {
  if (viewPlane === 'xz') return { axisA: 0, axisB: 2 };
  if (viewPlane === 'xy') return { axisA: 0, axisB: 1 };
  if (viewPlane === 'yz') return { axisA: 1, axisB: 2 };
  return null;
}

/**
 * Returns whether a finite ray segment hits any of the given meshes in 3D.
 *
 * @param origin Ray origin in world space.
 * @param direction Unit ray direction in world space.
 * @param length Ray length.
 * @param meshes Candidate content meshes.
 * @returns True when at least one intersection exists along the segment.
 */
export function doesGuideRayHitMeshes(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  length: number,
  meshes: readonly THREE.Mesh[],
): boolean {
  return findGuideRayMeshHitDistance(origin, direction, length, meshes) !== null;
}

/**
 * Resolves draw visibility and clipped length for one bounds guide ray.
 * Perspective uses 3D geometry then ground. Orthographic uses planar AABB tests
 * only (no ground plane) so depth stacking still counts as touching.
 *
 * @param options Ray and viewport context.
 * @returns Whether to show the ray and how far to draw it.
 */
export function resolveBoundsGuideRay(options: {
  viewPlane: CadViewPlane;
  axis: BoundsGuideAxis;
  worldOrigin: THREE.Vector3;
  worldDirection: THREE.Vector3;
  length: number;
  raycastMeshes?: readonly THREE.Mesh[];
  planarWorldBoxes?: readonly THREE.Box3[];
}): BoundsGuideRayResolution {
  if (!isBoundsGuideAxisDrawnInView(options.axis, options.viewPlane)) {
    return { show: false, drawLength: 0 };
  }
  if (options.viewPlane !== 'xyz') {
    if (!isGuideWorldDirectionInViewPlane(options.worldDirection, options.viewPlane)) {
      return { show: false, drawLength: 0 };
    }
    const planarDistance = findGuideRayPlanarHitDistance(
      options.worldOrigin,
      options.worldDirection,
      options.length,
      options.planarWorldBoxes ?? [],
      options.viewPlane,
    );
    if (planarDistance === null) return { show: false, drawLength: 0 };
    return { show: true, drawLength: planarDistance };
  }
  const geometryDistance = findGuideRayMeshHitDistance(
    options.worldOrigin,
    options.worldDirection,
    options.length,
    options.raycastMeshes ?? [],
  );
  if (geometryDistance !== null) {
    return { show: true, drawLength: geometryDistance };
  }
  const groundDistance = findGuideRayGroundHitDistance(options.worldOrigin, options.worldDirection, options.length);
  if (groundDistance !== null) {
    return { show: true, drawLength: groundDistance };
  }
  return { show: false, drawLength: 0 };
}

/**
 * Decides whether one bounds guide ray should be drawn in a viewport.
 *
 * @param options Ray and viewport context.
 * @returns True when the ray should appear.
 */
export function shouldShowBoundsGuideRay(options: {
  viewPlane: CadViewPlane;
  axis: BoundsGuideAxis;
  worldOrigin: THREE.Vector3;
  worldDirection: THREE.Vector3;
  length: number;
  raycastMeshes?: readonly THREE.Mesh[];
  planarWorldBoxes?: readonly THREE.Box3[];
}): boolean {
  return resolveBoundsGuideRay(options).show;
}

/**
 * Transforms a local bounds-space guide ray into world space.
 *
 * @param localStart Ray start in bounds-local coordinates.
 * @param localEnd Ray end in bounds-local coordinates.
 * @param boundsCenter World center of the bounds.
 * @param boundsQuaternion World orientation of the bounds.
 * @returns World origin, unit direction, and length.
 */
export function transformGuideRayToWorld(
  localStart: THREE.Vector3,
  localEnd: THREE.Vector3,
  boundsCenter: THREE.Vector3,
  boundsQuaternion: THREE.Quaternion,
): { origin: THREE.Vector3; direction: THREE.Vector3; length: number } {
  const origin = localStart.clone().applyQuaternion(boundsQuaternion).add(boundsCenter);
  const end = localEnd.clone().applyQuaternion(boundsQuaternion).add(boundsCenter);
  const offset = end.sub(origin);
  const length = offset.length();
  if (length < 1e-12) {
    return { origin, direction: new THREE.Vector3(1, 0, 0), length: 0 };
  }
  return { origin, direction: offset.multiplyScalar(1 / length), length };
}

/**
 * Computes a mesh world AABB from its geometry bounds (avoids full hierarchy
 * traversal used by setFromObject).
 *
 * @param mesh Mesh to bound.
 * @returns World box, or null when geometry is missing.
 */
function computeMeshWorldBox(mesh: THREE.Mesh): THREE.Box3 | null {
  const geometry = mesh.geometry;
  if (!geometry) return null;
  if (!geometry.boundingBox) {
    geometry.computeBoundingBox();
  }
  if (!geometry.boundingBox) return null;
  mesh.updateWorldMatrix(true, false);
  return geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
}

/**
 * Ray vs AABB using only the two view-plane axes. The depth axis is not tested
 * (always treated as a hit), matching orthographic 2D contact. Volumes that
 * already contain the origin, and contact entries within epsilon, are skipped
 * so a farther silhouette can become the draw target.
 *
 * @param origin Ray origin.
 * @param direction Unit direction.
 * @param length Max distance.
 * @param box World AABB.
 * @param axisA First in-plane axis index (0=x, 1=y, 2=z).
 * @param axisB Second in-plane axis index.
 * @param planarPadding Expansion on the two tested axes.
 * @returns Entry distance beyond contact, or null.
 */
export function rayHitDistanceOnPlaneAxes(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  length: number,
  box: THREE.Box3,
  axisA: CadLocalAxis,
  axisB: CadLocalAxis,
  planarPadding: number = 0,
): number | null {
  // Already overlapping this volume in the view plane — look past it via other boxes.
  if (isOriginInsidePlaneAxes(origin, box, axisA, axisB, planarPadding)) {
    return null;
  }
  let entry = 0;
  let exit = length;
  for (const axis of [axisA, axisB]) {
    const originValue = origin.getComponent(axis);
    const directionValue = direction.getComponent(axis);
    const minValue = box.min.getComponent(axis) - planarPadding;
    const maxValue = box.max.getComponent(axis) + planarPadding;
    const slab = intersectAxisSlab(originValue, directionValue, minValue, maxValue);
    if (!slab) return null;
    entry = Math.max(entry, slab.entry);
    exit = Math.min(exit, slab.exit);
    if (entry > exit + BOUNDS_GUIDE_HIT_EPSILON) return null;
  }
  if (exit < -BOUNDS_GUIDE_HIT_EPSILON || entry > length + BOUNDS_GUIDE_HIT_EPSILON) {
    return null;
  }
  // Touching this silhouette already — not a useful clip; prefer a farther hit.
  if (entry <= BOUNDS_GUIDE_HIT_EPSILON) {
    return null;
  }
  return clampRayDistance(entry, length);
}

/**
 * Returns whether the origin lies inside the box on the two plane axes only
 * (depth is ignored). Used to skip self-containing volumes in 2D tests.
 *
 * @param origin Ray origin.
 * @param box World AABB.
 * @param axisA First plane axis.
 * @param axisB Second plane axis.
 * @param planarPadding Expansion on plane axes.
 * @returns True when origin is inside the planar rectangle.
 */
function isOriginInsidePlaneAxes(
  origin: THREE.Vector3,
  box: THREE.Box3,
  axisA: CadLocalAxis,
  axisB: CadLocalAxis,
  planarPadding: number,
): boolean {
  for (const axis of [axisA, axisB]) {
    const value = origin.getComponent(axis);
    const minValue = box.min.getComponent(axis) - planarPadding;
    const maxValue = box.max.getComponent(axis) + planarPadding;
    if (value < minValue - BOUNDS_GUIDE_HIT_EPSILON || value > maxValue + BOUNDS_GUIDE_HIT_EPSILON) {
      return false;
    }
  }
  return true;
}

/**
 * Intersects a 1D ray with an inclusive interval.
 *
 * @param origin Coordinate on the axis.
 * @param direction Direction component on the axis.
 * @param min Inclusive interval min.
 * @param max Inclusive interval max.
 * @returns Entry/exit parameters, or null when missed.
 */
function intersectAxisSlab(
  origin: number,
  direction: number,
  min: number,
  max: number,
): { entry: number; exit: number } | null {
  if (Math.abs(direction) < 1e-12) {
    if (origin < min - BOUNDS_GUIDE_HIT_EPSILON || origin > max + BOUNDS_GUIDE_HIT_EPSILON) {
      return null;
    }
    return { entry: Number.NEGATIVE_INFINITY, exit: Number.POSITIVE_INFINITY };
  }
  let entry = (min - origin) / direction;
  let exit = (max - origin) / direction;
  if (entry > exit) {
    const swap = entry;
    entry = exit;
    exit = swap;
  }
  return { entry, exit };
}

/**
 * Builds primary and perpendicular offset origins for a thick ray sample set.
 *
 * @param origin Center ray origin.
 * @param direction Unit ray direction.
 * @param thickness Sample radius in world units.
 * @returns Origins to cast (center plus four cross offsets).
 */
function buildThickRayOrigins(origin: THREE.Vector3, direction: THREE.Vector3, thickness: number): THREE.Vector3[] {
  if (thickness <= 0) return [origin.clone()];
  const { lateralU, lateralV } = buildRayLateralAxes(direction);
  return [
    origin.clone(),
    origin.clone().addScaledVector(lateralU, thickness),
    origin.clone().addScaledVector(lateralU, -thickness),
    origin.clone().addScaledVector(lateralV, thickness),
    origin.clone().addScaledVector(lateralV, -thickness),
  ];
}

/**
 * Builds two unit axes perpendicular to a ray direction.
 *
 * @param direction Unit ray direction.
 * @returns Lateral basis vectors.
 */
function buildRayLateralAxes(direction: THREE.Vector3): {
  lateralU: THREE.Vector3;
  lateralV: THREE.Vector3;
} {
  const reference = Math.abs(direction.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const lateralU = new THREE.Vector3().crossVectors(direction, reference);
  if (lateralU.lengthSq() < 1e-12) {
    lateralU.set(1, 0, 0);
  } else {
    lateralU.normalize();
  }
  const lateralV = new THREE.Vector3().crossVectors(direction, lateralU).normalize();
  return { lateralU, lateralV };
}

/**
 * Clamps a hit distance into the drawable ray segment.
 *
 * @param distance Raw hit distance.
 * @param length Maximum ray length.
 * @returns Clamped non-negative distance.
 */
function clampRayDistance(distance: number, length: number): number {
  if (!Number.isFinite(distance)) return 0;
  return Math.min(length, Math.max(0, distance));
}
