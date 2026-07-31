import * as THREE from 'three';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { FaceSurfaceDescription, cloneFaceSurface } from '@/texture/uv_matrix/face_surface_description.js';
import { lockFaceSurfaceForBrushTransform } from './solid_brush_texture_lock.js';
import { shouldApplyWorldFixedUv, type SurfaceUvLockFlags } from '@/texture/uv_matrix/surface_uv_matrix_transform.js';

/** Position and stretch texture lock flags. */
export type TextureLockFlags = SurfaceUvLockFlags;

/**
 * Normalizes legacy boolean Tex Lock into dual flags, or passes flags through.
 *
 * @param value Boolean (both locks) or explicit flag pair.
 * @returns Normalized lock flags.
 */
export function normalizeTextureLockFlags(value: boolean | TextureLockFlags): TextureLockFlags {
  if (typeof value === 'boolean') {
    return { positionLock: value, stretchLock: value };
  }
  return {
    positionLock: value.positionLock === true,
    stretchLock: value.stretchLock === true,
  };
}

const scratchPrevPos = new THREE.Vector3();
const scratchNextPos = new THREE.Vector3();
const scratchPrevScale = new THREE.Vector3();
const scratchNextScale = new THREE.Vector3();
const scratchPrevQuat = new THREE.Quaternion();
const scratchNextQuat = new THREE.Quaternion();

/**
 * Returns whether a pose delta should update UV matrices under the given locks.
 *
 * @param previousWorldMatrix Prior local-to-world.
 * @param nextWorldMatrix New local-to-world.
 * @param flags Lock flags.
 * @returns True when matrices should be rewritten.
 */
export function shouldUpdateMappingsForLocks(
  previousWorldMatrix: THREE.Matrix4,
  nextWorldMatrix: THREE.Matrix4,
  flags: TextureLockFlags,
): boolean {
  previousWorldMatrix.decompose(scratchPrevPos, scratchPrevQuat, scratchPrevScale);
  nextWorldMatrix.decompose(scratchNextPos, scratchNextQuat, scratchNextScale);
  const moved = poseMoved(scratchPrevPos, scratchNextPos, scratchPrevQuat, scratchNextQuat);
  const scaled = !scratchPrevScale.equals(scratchNextScale);
  return shouldApplyWorldFixedUv(flags, moved, scaled);
}

/**
 * Applies position/stretch locks to a solid brush face surface.
 *
 * @param surface Surface before the transform.
 * @param instance Brush instance.
 * @param faceIndex Face index.
 * @param previousWorldMatrix Prior brush local-to-world.
 * @param nextWorldMatrix New brush local-to-world.
 * @param flags Lock flags.
 * @returns Surface for the new pose.
 */
export function applyTextureLocksToBrushFaceSurface(
  surface: FaceSurfaceDescription,
  instance: SolidBrushInstance,
  faceIndex: number,
  previousWorldMatrix: THREE.Matrix4,
  nextWorldMatrix: THREE.Matrix4,
  flags: TextureLockFlags,
): FaceSurfaceDescription {
  if (!shouldUpdateMappingsForLocks(previousWorldMatrix, nextWorldMatrix, flags)) {
    return cloneFaceSurface(surface);
  }
  return lockFaceSurfaceForBrushTransform(surface, instance, faceIndex, previousWorldMatrix, nextWorldMatrix, flags);
}

/**
 * Returns whether content meshes should rebake world UVs after a transform.
 * Scale (including face-pivot scale+translate) is governed only by stretch
 * lock; pure move/rotate is governed only by position lock.
 *
 * @param flags Lock flags.
 * @param moved True when translation/rotation changed.
 * @param scaled True when scale changed.
 * @returns True when world rebake should run.
 */
export function shouldRebakeContentAfterTransform(flags: TextureLockFlags, moved: boolean, scaled: boolean): boolean {
  return shouldApplyWorldFixedUv(flags, moved, scaled);
}

/**
 * Returns whether pose translation or rotation changed.
 *
 * @param prevPos Previous position.
 * @param nextPos Next position.
 * @param prevQuat Previous rotation.
 * @param nextQuat Next rotation.
 * @returns True when moved or rotated.
 */
function poseMoved(
  prevPos: THREE.Vector3,
  nextPos: THREE.Vector3,
  prevQuat: THREE.Quaternion,
  nextQuat: THREE.Quaternion,
): boolean {
  if (!prevPos.equals(nextPos)) return true;
  return (
    Math.abs(prevQuat.x - nextQuat.x) > 1e-10 ||
    Math.abs(prevQuat.y - nextQuat.y) > 1e-10 ||
    Math.abs(prevQuat.z - nextQuat.z) > 1e-10 ||
    Math.abs(prevQuat.w - nextQuat.w) > 1e-10
  );
}
