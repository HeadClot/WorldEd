import * as THREE from 'three';
import { BoundsFace } from '@/types/bounds_face.js';
import { getBoundsFaceHalfExtent, getBoundsFaceLocalNormal, DataOrientedBounds } from './builder_oriented_bounds.js';

/** Minimum half-extent allowed when resizing a bounds face. */
export const MIN_BOUNDS_HALF_EXTENT = 0.05;

/** Result of applying a one-sided bounds resize to a single mesh. */
export interface MeshBoundsResizeResult {
  position: THREE.Vector3;
  scale: THREE.Vector3;
}

/**
 * Computes the world-space center of the opposite (fixed) face before a resize.
 *
 * @param bounds The oriented bounds at drag start.
 * @param face The face being dragged.
 * @returns World position of the fixed opposite face center.
 */
export function getFixedFaceWorldCenter(bounds: DataOrientedBounds, face: BoundsFace): THREE.Vector3 {
  const outward = getBoundsFaceLocalNormal(face).applyQuaternion(bounds.quaternion).normalize();
  const half = getBoundsFaceHalfExtent(bounds.halfExtents, face);
  return bounds.center.clone().addScaledVector(outward, -half);
}

/**
 * Snaps a signed face displacement to whole grid steps. Rounds the movement
 * alone so off-grid faces keep their offset and only travel in interval
 * increments.
 *
 * @param deltaAlongNormal Raw displacement along the face outward normal.
 * @param snapEnabled Whether grid snapping is active.
 * @param snapInterval Grid interval when snapping.
 * @returns Snapped or raw delta relative to the start face.
 */
export function snapBoundsFaceDelta(deltaAlongNormal: number, snapEnabled: boolean, snapInterval: number): number {
  if (!snapEnabled || snapInterval <= 0) {
    return deltaAlongNormal;
  }
  return Math.round(deltaAlongNormal / snapInterval) * snapInterval;
}

/**
 * Computes absolute position and scale after a one-sided resize of one mesh.
 * The opposite face stays fixed in world space, even when geometry is not
 * centered on the mesh origin (e.g. after clipping a solid brush).
 *
 * @param startPosition Mesh position at drag start.
 * @param startScale Mesh scale at drag start.
 * @param startBounds OBB at drag start (object or selection frame).
 * @param face The face being dragged outward.
 * @param deltaAlongNormal Signed world displacement of the dragged face.
 * @returns New position and scale for the mesh.
 */
export function computeOneSidedMeshResize(
  startPosition: THREE.Vector3,
  startScale: THREE.Vector3,
  startBounds: DataOrientedBounds,
  face: BoundsFace,
  deltaAlongNormal: number,
): MeshBoundsResizeResult {
  const resize = resolveResizeExtents(startBounds, face, deltaAlongNormal);
  const desiredBoundsCenter = startBounds.center.clone().addScaledVector(resize.outward, resize.appliedDelta * 0.5);
  const worldOffsetAfter = computeScaledGeometryWorldOffset(startPosition, startBounds, face, resize.factor);
  const position = desiredBoundsCenter.sub(worldOffsetAfter);
  const scale = multiplyScaleAlongLocalFace(startScale, face, resize.factor);
  return { position, scale };
}

/**
 * Multiplies a scale vector along the local axis of a bounds face.
 *
 * @param startScale Scale at drag start.
 * @param face The face defining the local axis.
 * @param factor Multiplicative scale factor along that axis.
 * @returns A new scale vector.
 */
export function multiplyScaleAlongLocalFace(
  startScale: THREE.Vector3,
  face: BoundsFace,
  factor: number,
): THREE.Vector3 {
  const scale = startScale.clone();
  const safeFactor = Math.max(0.01, factor);
  if (face === BoundsFace.POS_X || face === BoundsFace.NEG_X) {
    scale.x = Math.max(0.01, scale.x * safeFactor);
    return scale;
  }
  if (face === BoundsFace.POS_Y || face === BoundsFace.NEG_Y) {
    scale.y = Math.max(0.01, scale.y * safeFactor);
    return scale;
  }
  scale.z = Math.max(0.01, scale.z * safeFactor);
  return scale;
}

/**
 * Multiplies scale along the dominant world axis of a direction. Used for
 * multi-select world-AABB resize.
 *
 * @param startScale Scale at drag start.
 * @param worldAxis Direction of resize in world space.
 * @param factor Multiplicative factor.
 * @returns A new scale vector.
 */
export function multiplyScaleAlongWorldAxis(
  startScale: THREE.Vector3,
  worldAxis: THREE.Vector3,
  factor: number,
): THREE.Vector3 {
  const scale = startScale.clone();
  const safeFactor = Math.max(0.01, factor);
  const absX = Math.abs(worldAxis.x);
  const absY = Math.abs(worldAxis.y);
  const absZ = Math.abs(worldAxis.z);
  if (absX >= absY && absX >= absZ) {
    scale.x = Math.max(0.01, scale.x * safeFactor);
    return scale;
  }
  if (absY >= absX && absY >= absZ) {
    scale.y = Math.max(0.01, scale.y * safeFactor);
    return scale;
  }
  scale.z = Math.max(0.01, scale.z * safeFactor);
  return scale;
}

/**
 * Computes multi-mesh one-sided resize using a shared world-axis bounds frame.
 * Each mesh is scaled from the fixed opposite face plane so the selection
 * opposite side stays put when geometry is origin-centered.
 *
 * @param startPosition Mesh position at drag start.
 * @param startScale Mesh scale at drag start.
 * @param startBounds Shared selection bounds at drag start.
 * @param face The face being dragged.
 * @param deltaAlongNormal Signed displacement of the dragged face.
 * @returns New position and scale.
 */
export function computeOneSidedMultiMeshResize(
  startPosition: THREE.Vector3,
  startScale: THREE.Vector3,
  startBounds: DataOrientedBounds,
  face: BoundsFace,
  deltaAlongNormal: number,
): MeshBoundsResizeResult {
  const resize = resolveResizeExtents(startBounds, face, deltaAlongNormal);
  const fixedFaceCenter = getFixedFaceWorldCenter(startBounds, face);
  const alongFromFixed = startPosition.clone().sub(fixedFaceCenter).dot(resize.outward);
  const position = startPosition.clone().addScaledVector(resize.outward, alongFromFixed * (resize.factor - 1));
  const scale = multiplyScaleAlongWorldAxis(startScale, resize.outward, resize.factor);
  return { position, scale };
}

/** Shared half-extent and normal data for a one-sided face drag. */
interface ResolvedResizeExtents {
  factor: number;
  appliedDelta: number;
  outward: THREE.Vector3;
}

/**
 * Resolves the scale factor, applied face travel, and outward normal for a
 * one-sided resize.
 *
 * @param startBounds Bounds at drag start.
 * @param face Face being dragged.
 * @param deltaAlongNormal Signed face displacement.
 * @returns Factor, applied delta, and outward normal.
 */
function resolveResizeExtents(
  startBounds: DataOrientedBounds,
  face: BoundsFace,
  deltaAlongNormal: number,
): ResolvedResizeExtents {
  const oldHalf = getBoundsFaceHalfExtent(startBounds.halfExtents, face);
  const safeOldHalf = Math.max(oldHalf, MIN_BOUNDS_HALF_EXTENT);
  const newHalf = Math.max(MIN_BOUNDS_HALF_EXTENT, safeOldHalf + deltaAlongNormal * 0.5);
  const factor = newHalf / safeOldHalf;
  const outward = getBoundsFaceLocalNormal(face).applyQuaternion(startBounds.quaternion).normalize();
  const appliedDelta = (newHalf - safeOldHalf) * 2;
  return { factor, appliedDelta, outward };
}

/**
 * Returns the face displacement that will actually be applied after the minimum
 * half-extent clamp (may be less negative than the requested delta).
 *
 * @param startBounds Bounds at drag start.
 * @param face Face being dragged.
 * @param deltaAlongNormal Requested signed face displacement.
 * @returns Applied delta used for position/scale writes.
 */
export function resolveAppliedBoundsFaceDelta(
  startBounds: DataOrientedBounds,
  face: BoundsFace,
  deltaAlongNormal: number,
): number {
  return resolveResizeExtents(startBounds, face, deltaAlongNormal).appliedDelta;
}

/**
 * Computes where the geometry AABB center sits relative to the mesh origin
 * after scaling along a face axis. Three.js scales about the mesh origin, so an
 * offset local AABB (common after clipping) expands away from the origin and
 * must be cancelled by position.
 *
 * @param startPosition Mesh position at drag start.
 * @param startBounds Oriented bounds at drag start.
 * @param face Face axis being scaled.
 * @param factor Multiplicative scale factor along that axis.
 * @returns World-space offset from mesh position to bounds center after scale.
 */
function computeScaledGeometryWorldOffset(
  startPosition: THREE.Vector3,
  startBounds: DataOrientedBounds,
  face: BoundsFace,
  factor: number,
): THREE.Vector3 {
  const worldOffsetBefore = startBounds.center.clone().sub(startPosition);
  const inverseRotation = startBounds.quaternion.clone().invert();
  const localScaledOffset = worldOffsetBefore.applyQuaternion(inverseRotation);
  const localScaledOffsetAfter = scaleOffsetAlongLocalFace(localScaledOffset, face, factor);
  return localScaledOffsetAfter.applyQuaternion(startBounds.quaternion);
}

/**
 * Multiplies one component of a free offset vector along a bounds face axis.
 * Offsets may be zero or negative, so values are not clamped.
 *
 * @param offset Local scaled offset from mesh origin to geometry center.
 * @param face Face defining the local axis.
 * @param factor Multiplicative factor along that axis.
 * @returns A new offset vector.
 */
function scaleOffsetAlongLocalFace(offset: THREE.Vector3, face: BoundsFace, factor: number): THREE.Vector3 {
  const result = offset.clone();
  if (face === BoundsFace.POS_X || face === BoundsFace.NEG_X) {
    result.x *= factor;
    return result;
  }
  if (face === BoundsFace.POS_Y || face === BoundsFace.NEG_Y) {
    result.y *= factor;
    return result;
  }
  result.z *= factor;
  return result;
}
