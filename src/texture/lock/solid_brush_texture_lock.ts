import * as THREE from 'three';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { FaceSurfaceDescription, cloneFaceSurface } from '@/texture/uv_matrix/face_surface_description.js';
import {
  transformBrushLocalUvForPoseChange,
  type SurfaceUvLockFlags,
} from '@/texture/uv_matrix/surface_uv_matrix_transform.js';

const scratchPrevLocal = new THREE.Matrix4();
const scratchNextLocal = new THREE.Matrix4();
const scratchPrevWorld = new THREE.Matrix4();
const scratchNextWorld = new THREE.Matrix4();
const scratchQuat = new THREE.Quaternion();

/**
 * Snapshot of brush pose and face surfaces at the start of a live drag.
 * Absolute lock from this baseline avoids incremental offset drift.
 */
export interface SolidBrushTextureLockBaseline {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  /** Per-face surfaces at drag start (index matches brush faces). */
  faceSurfaces: FaceSurfaceDescription[];
  /** @deprecated Prefer faceSurfaces; kept for interim callers. */
  faceMappings?: FaceSurfaceDescription[];
}

/**
 * Captures pose and face surfaces for absolute texture lock during a drag.
 *
 * @param instance Brush at the pre-drag pose.
 * @returns Baseline snapshot.
 */
export function captureSolidBrushTextureLockBaseline(instance: SolidBrushInstance): SolidBrushTextureLockBaseline {
  const faceCount = instance.brush.faces.length;
  const faceSurfaces: FaceSurfaceDescription[] = [];
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    faceSurfaces.push(instance.getFaceSurface(faceIndex));
  }
  return {
    position: instance.position.clone(),
    rotation: instance.rotation.clone(),
    scale: instance.scale.clone(),
    faceSurfaces,
    faceMappings: faceSurfaces,
  };
}

/**
 * When texture lock is on, adjusts solid brush UV matrices so appearance
 * follows lock policy across a transform. Call after the instance transform has
 * been updated to the new pose, passing the previous local transform
 * components.
 *
 * @param instance Brush whose face surfaces should update.
 * @param previousPosition Local position before the transform.
 * @param previousRotation Local rotation before the transform.
 * @param previousScale Local scale before the transform.
 * @param parentWorldMatrix World matrix of the brush parent (solid root).
 * @param flags Optional lock flags (default both on).
 */
export function lockSolidBrushTexturesToTransform(
  instance: SolidBrushInstance,
  previousPosition: THREE.Vector3,
  previousRotation: THREE.Euler,
  previousScale: THREE.Vector3,
  parentWorldMatrix: THREE.Matrix4,
  flags: SurfaceUvLockFlags = { positionLock: true, stretchLock: true },
): void {
  composeLocalMatrix(previousPosition, previousRotation, previousScale, scratchPrevLocal);
  composeLocalMatrix(instance.position, instance.rotation, instance.scale, scratchNextLocal);
  scratchPrevWorld.multiplyMatrices(parentWorldMatrix, scratchPrevLocal);
  scratchNextWorld.multiplyMatrices(parentWorldMatrix, scratchNextLocal);
  applyLocksToAllFaces(instance, scratchPrevWorld, scratchNextWorld, flags);
}

/**
 * Restores baseline surfaces and locks them from the baseline pose to the
 * instance's current pose (absolute, not incremental).
 *
 * @param instance Brush already at the new pose.
 * @param baseline Snapshot from drag start.
 * @param parentWorldMatrix World matrix of the solid root.
 * @param flags Lock flags.
 */
export function lockSolidBrushTexturesFromBaseline(
  instance: SolidBrushInstance,
  baseline: SolidBrushTextureLockBaseline,
  parentWorldMatrix: THREE.Matrix4,
  flags: SurfaceUvLockFlags = { positionLock: true, stretchLock: true },
): void {
  composeLocalMatrix(baseline.position, baseline.rotation, baseline.scale, scratchPrevLocal);
  composeLocalMatrix(instance.position, instance.rotation, instance.scale, scratchNextLocal);
  scratchPrevWorld.multiplyMatrices(parentWorldMatrix, scratchPrevLocal);
  scratchNextWorld.multiplyMatrices(parentWorldMatrix, scratchNextLocal);
  const sources = baseline.faceSurfaces ?? baseline.faceMappings ?? [];
  const faceCount = instance.brush.faces.length;
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    const source = sources[faceIndex] ?? instance.getFaceSurface(faceIndex);
    const locked = lockFaceSurfaceForBrushTransform(
      source,
      instance,
      faceIndex,
      scratchPrevWorld,
      scratchNextWorld,
      flags,
    );
    instance.setFaceSurface(faceIndex, locked);
  }
}

/**
 * Locks one face surface UV matrix across a brush transform.
 *
 * @param surface Surface before the transform.
 * @param instance Brush instance (for plane data).
 * @param faceIndex Face index on the brush.
 * @param previousWorldMatrix Brush local-to-world before the transform.
 * @param nextWorldMatrix Brush local-to-world after the transform.
 * @param flags Lock flags.
 * @returns Surface with UV matrix adjusted for lock policy.
 */
export function lockFaceSurfaceForBrushTransform(
  surface: FaceSurfaceDescription,
  instance: SolidBrushInstance,
  faceIndex: number,
  previousWorldMatrix: THREE.Matrix4,
  nextWorldMatrix: THREE.Matrix4,
  flags: SurfaceUvLockFlags,
): FaceSurfaceDescription {
  const result = cloneFaceSurface(surface);
  result.uv = transformBrushLocalUvForPoseChange(
    surface.uv,
    instance.faceNormalLocal(faceIndex),
    instance.facePlaneOffsetLocal(faceIndex),
    previousWorldMatrix,
    nextWorldMatrix,
    flags,
  );
  return result;
}

/**
 * Applies lock updates to every face on a brush.
 *
 * @param instance Brush at the new pose.
 * @param previousWorld Prior world matrix.
 * @param nextWorld New world matrix.
 * @param flags Lock flags.
 */
export function applyLocksToAllBrushFaces(
  instance: SolidBrushInstance,
  previousWorld: THREE.Matrix4,
  nextWorld: THREE.Matrix4,
  flags: SurfaceUvLockFlags,
): void {
  applyLocksToAllFaces(instance, previousWorld, nextWorld, flags);
}

/**
 * Applies lock updates to every face on a brush.
 *
 * @param instance Brush instance.
 * @param previousWorld Prior world matrix.
 * @param nextWorld New world matrix.
 * @param flags Lock flags.
 */
function applyLocksToAllFaces(
  instance: SolidBrushInstance,
  previousWorld: THREE.Matrix4,
  nextWorld: THREE.Matrix4,
  flags: SurfaceUvLockFlags,
): void {
  const faceCount = instance.brush.faces.length;
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    const locked = lockFaceSurfaceForBrushTransform(
      instance.getFaceSurface(faceIndex),
      instance,
      faceIndex,
      previousWorld,
      nextWorld,
      flags,
    );
    instance.setFaceSurface(faceIndex, locked);
  }
}

/**
 * Builds a local TRS matrix into the target matrix.
 *
 * @param position Local position.
 * @param rotation Local Euler rotation.
 * @param scale Local scale.
 * @param target Matrix to write.
 */
function composeLocalMatrix(
  position: THREE.Vector3,
  rotation: THREE.Euler,
  scale: THREE.Vector3,
  target: THREE.Matrix4,
): void {
  scratchQuat.setFromEuler(rotation);
  target.compose(position, scratchQuat, scale);
}
