import * as THREE from 'three';
import type { ObjectApplyTransformFlags } from './object_apply_transform_flags.js';

/**
 * Builds the vertex bake matrix for selected Object → Apply channels so world
 * geometry is unchanged after those channels are cleared. Partial bakes must
 * account for non-commuting TRS: bake = inv(remaining) * full, not compose of
 * only the applied channels (which mis-places scaled location and shears
 * rotation with non-uniform scale).
 *
 * @param object Source object pose.
 * @param flags Channels to bake into geometry.
 * @returns Local matrix to apply to vertices before clearing the channels.
 */
export function buildObjectApplyBakeMatrix(object: THREE.Object3D, flags: ObjectApplyTransformFlags): THREE.Matrix4 {
  object.updateMatrix();
  const fullMatrix = object.matrix.clone();
  const remainingMatrix = buildObjectApplyRemainingMatrix(object, flags);
  return remainingMatrix.invert().multiply(fullMatrix);
}

/**
 * Builds the local TRS matrix that remains after the selected channels are
 * cleared (identity for each applied channel).
 *
 * @param object Source object pose.
 * @param flags Channels that will be cleared.
 * @returns Remaining local matrix after apply.
 */
export function buildObjectApplyRemainingMatrix(
  object: THREE.Object3D,
  flags: ObjectApplyTransformFlags,
): THREE.Matrix4 {
  const position = flags.location ? new THREE.Vector3(0, 0, 0) : object.position.clone();
  const quaternion = flags.rotation ? new THREE.Quaternion() : object.quaternion.clone();
  const scale = flags.scale ? new THREE.Vector3(1, 1, 1) : object.scale.clone();
  return new THREE.Matrix4().compose(position, quaternion, scale);
}

/**
 * Clears the applied transform channels on an object, leaving others intact.
 *
 * @param object Target object.
 * @param flags Channels that were baked.
 */
export function clearObjectAppliedTransformChannels(object: THREE.Object3D, flags: ObjectApplyTransformFlags): void {
  if (flags.location) {
    object.position.set(0, 0, 0);
  }
  if (flags.rotation) {
    object.rotation.set(0, 0, 0);
    object.quaternion.identity();
  }
  if (flags.scale) {
    object.scale.set(1, 1, 1);
  }
  object.updateMatrix();
  object.updateMatrixWorld(true);
}

/**
 * Captures local pose for undo.
 *
 * @param object Source object.
 * @returns Pose snapshot.
 */
export function captureObjectLocalPose(object: THREE.Object3D): ObjectLocalPoseSnapshot {
  return {
    position: object.position.clone(),
    rotation: object.rotation.clone(),
    scale: object.scale.clone(),
  };
}

/**
 * Restores a captured local pose.
 *
 * @param object Target object.
 * @param pose Snapshot.
 */
export function restoreObjectLocalPose(object: THREE.Object3D, pose: ObjectLocalPoseSnapshot): void {
  object.position.copy(pose.position);
  object.rotation.copy(pose.rotation);
  object.scale.copy(pose.scale);
  object.updateMatrix();
  object.updateMatrixWorld(true);
}

/** Local position/rotation/scale snapshot. */
export interface ObjectLocalPoseSnapshot {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
}
