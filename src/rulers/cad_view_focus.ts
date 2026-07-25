import * as THREE from 'three';
import type { OrientedBoundsData } from '../transform/bounds/oriented_bounds.js';

const scratchLocalOrigin = new THREE.Vector3();
const scratchLocalDir = new THREE.Vector3();
const scratchInvQuat = new THREE.Quaternion();
const scratchHitLocal = new THREE.Vector3();
const scratchClosest = new THREE.Vector3();
const scratchRayPoint = new THREE.Vector3();
const scratchViewDir = new THREE.Vector3();
const scratchLocalPoint = new THREE.Vector3();

/**
 * Finds the point on an oriented box that the camera is looking at. Outside:
 * near ray hit (entry surface). Inside: far ray hit (wall ahead), because a
 * near hit from inside is at the eye and breaks placement.
 *
 * @param camera Viewport camera.
 * @param bounds Oriented selection bounds.
 * @param target Receives the world-space focus point on the box.
 */
export function writeCameraViewFocusOnBounds(
  camera: THREE.Camera,
  bounds: OrientedBoundsData,
  target: THREE.Vector3,
): void {
  camera.getWorldDirection(scratchViewDir);
  const inside = isPointInsideOrientedBounds(camera.position, bounds);
  if (intersectOrientedBoundsRay(camera.position, scratchViewDir, bounds, target, inside)) {
    return;
  }
  writeClosestPointOnOrientedBoundsToRay(camera.position, scratchViewDir, bounds, target);
}

/**
 * Returns whether a world point lies inside an oriented box (inclusive).
 *
 * @param point World point.
 * @param bounds Oriented box.
 * @returns True when the point is inside or on the surface.
 */
export function isPointInsideOrientedBounds(point: THREE.Vector3, bounds: OrientedBoundsData): boolean {
  scratchInvQuat.copy(bounds.quaternion).invert();
  scratchLocalPoint.copy(point).sub(bounds.center).applyQuaternion(scratchInvQuat);
  const half = bounds.halfExtents;
  return (
    Math.abs(scratchLocalPoint.x) <= half.x + 1e-8 &&
    Math.abs(scratchLocalPoint.y) <= half.y + 1e-8 &&
    Math.abs(scratchLocalPoint.z) <= half.z + 1e-8
  );
}

/**
 * Intersects a world ray with an oriented box.
 *
 * @param origin Ray origin in world space.
 * @param direction Normalized ray direction in world space.
 * @param bounds Oriented box.
 * @param target Receives the hit in world space.
 * @param preferFar When true (camera inside), use the exit hit instead of
 *   entry.
 * @returns True when the ray hits the box.
 */
export function intersectOrientedBoundsRay(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  bounds: OrientedBoundsData,
  target: THREE.Vector3,
  preferFar: boolean = false,
): boolean {
  scratchInvQuat.copy(bounds.quaternion).invert();
  scratchLocalOrigin.copy(origin).sub(bounds.center).applyQuaternion(scratchInvQuat);
  scratchLocalDir.copy(direction).applyQuaternion(scratchInvQuat).normalize();
  const hitT = intersectLocalAabbHitT(
    scratchLocalOrigin,
    scratchLocalDir,
    bounds.halfExtents.x,
    bounds.halfExtents.y,
    bounds.halfExtents.z,
    preferFar,
  );
  if (hitT === null) return false;
  scratchHitLocal.copy(scratchLocalDir).multiplyScalar(hitT).add(scratchLocalOrigin);
  target.copy(scratchHitLocal).applyQuaternion(bounds.quaternion).add(bounds.center);
  return true;
}

/**
 * Writes the closest point on an oriented box to a world ray.
 *
 * @param origin Ray origin.
 * @param direction Normalized ray direction.
 * @param bounds Oriented box.
 * @param target Receives the closest world point on the box.
 */
export function writeClosestPointOnOrientedBoundsToRay(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  bounds: OrientedBoundsData,
  target: THREE.Vector3,
): void {
  scratchInvQuat.copy(bounds.quaternion).invert();
  scratchLocalOrigin.copy(origin).sub(bounds.center).applyQuaternion(scratchInvQuat);
  scratchLocalDir.copy(direction).applyQuaternion(scratchInvQuat).normalize();
  const t = Math.max(0, -scratchLocalOrigin.dot(scratchLocalDir));
  scratchRayPoint.copy(scratchLocalDir).multiplyScalar(t).add(scratchLocalOrigin);
  clampLocalPointToAabb(scratchRayPoint, bounds.halfExtents, scratchClosest);
  target.copy(scratchClosest).applyQuaternion(bounds.quaternion).add(bounds.center);
}

/**
 * Slab-method ray vs AABB. Returns entry t outside, or exit t when preferFar.
 *
 * @param origin Local ray origin.
 * @param direction Local unit direction.
 * @param halfX Half extent X.
 * @param halfY Half extent Y.
 * @param halfZ Half extent Z.
 * @param preferFar Prefer the far intersection (camera inside).
 * @returns Hit distance along the ray, or null if miss.
 */
function intersectLocalAabbHitT(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  halfX: number,
  halfY: number,
  halfZ: number,
  preferFar: boolean,
): number | null {
  const slabX = slabInterval(origin.x, direction.x, -halfX, halfX);
  if (!slabX) return null;
  const slabY = slabInterval(origin.y, direction.y, -halfY, halfY);
  if (!slabY) return null;
  const slabZ = slabInterval(origin.z, direction.z, -halfZ, halfZ);
  if (!slabZ) return null;
  const near = Math.max(slabX.near, slabY.near, slabZ.near);
  const far = Math.min(slabX.far, slabY.far, slabZ.far);
  if (far < near) return null;
  if (preferFar) {
    if (far < 0) return null;
    return far;
  }
  if (far < 0) return null;
  return Math.max(near, 0);
}

/**
 * Computes entry/exit t for one AABB slab.
 *
 * @param origin Component of ray origin.
 * @param direction Component of ray direction.
 * @param minBound Slab minimum.
 * @param maxBound Slab maximum.
 * @returns Near/far interval, or null if parallel and outside.
 */
function slabInterval(
  origin: number,
  direction: number,
  minBound: number,
  maxBound: number,
): { near: number; far: number } | null {
  if (Math.abs(direction) < 1e-12) {
    if (origin < minBound || origin > maxBound) return null;
    return { near: Number.NEGATIVE_INFINITY, far: Number.POSITIVE_INFINITY };
  }
  let t1 = (minBound - origin) / direction;
  let t2 = (maxBound - origin) / direction;
  if (t1 > t2) {
    const swap = t1;
    t1 = t2;
    t2 = swap;
  }
  return { near: t1, far: t2 };
}

/**
 * Clamps a local-space point into the AABB [-half, half].
 *
 * @param point Local point.
 * @param halfExtents Box half extents.
 * @param target Receives clamped local point.
 */
function clampLocalPointToAabb(point: THREE.Vector3, halfExtents: THREE.Vector3, target: THREE.Vector3): void {
  target.set(
    THREE.MathUtils.clamp(point.x, -halfExtents.x, halfExtents.x),
    THREE.MathUtils.clamp(point.y, -halfExtents.y, halfExtents.y),
    THREE.MathUtils.clamp(point.z, -halfExtents.z, halfExtents.z),
  );
}
