import * as THREE from 'three';
import { SurfaceUvMatrix } from './surface_uv_matrix.js';
import { worldTransformToPlaneSpace } from './plane_space_matrix.js';

/** Position and stretch lock flags for solid brush UV matrices. */
export interface SurfaceUvLockFlags {
  /** When true, UVs stick through translation and rotation. */
  positionLock: boolean;
  /** When true, UVs stretch with scale. */
  stretchLock: boolean;
}

const scratchPrevPos = new THREE.Vector3();
const scratchNextPos = new THREE.Vector3();
const scratchPrevScale = new THREE.Vector3();
const scratchNextScale = new THREE.Vector3();
const scratchPrevQuat = new THREE.Quaternion();
const scratchNextQuat = new THREE.Quaternion();
const scratchInvPrev = new THREE.Matrix4();
const scratchDelta = new THREE.Matrix4();

/**
 * Transforms a brush-local UV matrix across a brush local-to-world pose change
 * according to position/stretch locks (Hammer-style level editors).
 *
 * Full stick (both locks): matrix unchanged — geometry carries UV. World-fixed
 * (unlocked components): M' = M * inv(L_prev) * L_next so world UV stays fixed.
 * Stretch lock off uses this on scale so pulling a side reveals more tiles
 * locked to the stationary side (bounds pivot).
 *
 * @param uv UV matrix before the pose change (brush-local).
 * @param faceNormalLocal Face normal in brush-local space.
 * @param facePlaneOffsetLocal Plane offset d in brush-local space.
 * @param previousLocalToWorld Brush local→world before transform.
 * @param nextLocalToWorld Brush local→world after transform.
 * @param flags Lock flags.
 * @returns UV matrix for the new pose (brush-local).
 */
export function transformBrushLocalUvForPoseChange(
  uv: SurfaceUvMatrix,
  faceNormalLocal: THREE.Vector3,
  facePlaneOffsetLocal: number,
  previousLocalToWorld: THREE.Matrix4,
  nextLocalToWorld: THREE.Matrix4,
  flags: SurfaceUvLockFlags,
): SurfaceUvMatrix {
  previousLocalToWorld.decompose(scratchPrevPos, scratchPrevQuat, scratchPrevScale);
  nextLocalToWorld.decompose(scratchNextPos, scratchNextQuat, scratchNextScale);
  const moved = poseTranslationOrRotationChanged();
  const scaled = !scratchPrevScale.equals(scratchNextScale);
  if (!moved && !scaled) {
    return uv.clone();
  }
  if (flags.positionLock && flags.stretchLock) {
    return uv.clone();
  }
  const unlockMove = moved && !flags.positionLock;
  const unlockScale = scaled && !flags.stretchLock;
  if (!unlockMove && !unlockScale) {
    return uv.clone();
  }
  // World-fixed UV: keep world appearance under the pose delta.
  // When stretch is off, this also handles face-pivot scale (scale + translate)
  // so the stationary side keeps its tiles and the free side reveals more.
  void faceNormalLocal;
  void facePlaneOffsetLocal;
  return applyWorldFixedUvMatrix(uv, previousLocalToWorld, nextLocalToWorld);
}

/**
 * Rewrites a brush-local UV matrix so world-space UVs stay fixed under a pose
 * change: M_local' = M_local * inv(L_prev) * L_next.
 *
 * @param uv Previous brush-local UV matrix.
 * @param previousLocalToWorld Prior pose.
 * @param nextLocalToWorld New pose.
 * @returns Updated brush-local UV matrix.
 */
function applyWorldFixedUvMatrix(
  uv: SurfaceUvMatrix,
  previousLocalToWorld: THREE.Matrix4,
  nextLocalToWorld: THREE.Matrix4,
): SurfaceUvMatrix {
  scratchInvPrev.copy(previousLocalToWorld).invert();
  scratchDelta.multiplyMatrices(scratchInvPrev, nextLocalToWorld);
  return uv.multiplyMatrix4(scratchDelta);
}

/**
 * Returns whether translation or rotation changed between decompositions.
 *
 * @returns True when moved or rotated.
 */
function poseTranslationOrRotationChanged(): boolean {
  if (!scratchPrevPos.equals(scratchNextPos)) return true;
  return (
    Math.abs(scratchPrevQuat.x - scratchNextQuat.x) > 1e-10 ||
    Math.abs(scratchPrevQuat.y - scratchNextQuat.y) > 1e-10 ||
    Math.abs(scratchPrevQuat.z - scratchNextQuat.z) > 1e-10 ||
    Math.abs(scratchPrevQuat.w - scratchNextQuat.w) > 1e-10
  );
}

/**
 * Applies a plane-space transform to a UV matrix (UV' = UV * planeT).
 *
 * @param uv Source UV matrix.
 * @param planeSpaceTransform Transform in plane space.
 * @returns Transformed UV matrix.
 */
export function transformUvMatrixInPlaneSpace(
  uv: SurfaceUvMatrix,
  planeSpaceTransform: THREE.Matrix4,
): SurfaceUvMatrix {
  return uv.multiplyMatrix4(planeSpaceTransform);
}

/**
 * Builds a plane-space form of a world transform for a face plane.
 *
 * @param worldTransform World-space transform.
 * @param normal Plane normal.
 * @param planeOffset Plane offset d.
 * @returns Plane-space transform.
 */
export function buildPlaneSpaceTransform(
  worldTransform: THREE.Matrix4,
  normal: THREE.Vector3,
  planeOffset: number,
): THREE.Matrix4 {
  return worldTransformToPlaneSpace(worldTransform, normal, planeOffset);
}
