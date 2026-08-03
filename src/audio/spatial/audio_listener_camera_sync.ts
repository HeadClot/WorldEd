import type { Camera } from 'three';
import * as THREE from 'three';

/**
 * Writes a Three.js camera pose onto the Web Audio listener (same model as
 * THREE.AudioListener without allocating a second AudioContext).
 *
 * @param context Live audio context whose listener is updated.
 * @param camera Camera that owns the listener pose (typically perspective).
 */
export function syncAudioListenerFromCamera(context: AudioContext, camera: Camera): void {
  camera.updateMatrixWorld(true);
  const worldPosition = new THREE.Vector3();
  const worldQuaternion = new THREE.Quaternion();
  camera.getWorldPosition(worldPosition);
  camera.getWorldQuaternion(worldQuaternion);
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(worldQuaternion).normalize();
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(worldQuaternion).normalize();
  writeAudioListenerPose(context.listener, worldPosition, forward, up);
}

/**
 * Writes position and orientation onto a Web Audio listener.
 *
 * @param listener Context listener.
 * @param position World position.
 * @param forward Unit forward vector (camera look direction).
 * @param up Unit up vector.
 */
function writeAudioListenerPose(
  listener: AudioListener,
  position: THREE.Vector3,
  forward: THREE.Vector3,
  up: THREE.Vector3,
): void {
  if (hasAudioParamListener(listener)) {
    writeAudioParamListener(listener, position, forward, up);
    return;
  }
  writeLegacyAudioListener(listener, position, forward, up);
}

/**
 * Returns whether the listener exposes AudioParam position/orientation fields.
 *
 * @param listener Context listener.
 * @returns True when modern AudioParam setters exist.
 */
function hasAudioParamListener(listener: AudioListener): boolean {
  return typeof listener.positionX !== 'undefined';
}

/**
 * Writes pose using AudioParam fields (current Web Audio).
 *
 * @param listener Context listener.
 * @param position World position.
 * @param forward Unit forward.
 * @param up Unit up.
 */
function writeAudioParamListener(
  listener: AudioListener,
  position: THREE.Vector3,
  forward: THREE.Vector3,
  up: THREE.Vector3,
): void {
  listener.positionX.value = position.x;
  listener.positionY.value = position.y;
  listener.positionZ.value = position.z;
  listener.forwardX.value = forward.x;
  listener.forwardY.value = forward.y;
  listener.forwardZ.value = forward.z;
  listener.upX.value = up.x;
  listener.upY.value = up.y;
  listener.upZ.value = up.z;
}

/**
 * Writes pose using legacy setPosition/setOrientation when present.
 *
 * @param listener Context listener.
 * @param position World position.
 * @param forward Unit forward.
 * @param up Unit up.
 */
function writeLegacyAudioListener(
  listener: AudioListener,
  position: THREE.Vector3,
  forward: THREE.Vector3,
  up: THREE.Vector3,
): void {
  const legacy = listener as AudioListener & {
    setPosition?: (x: number, y: number, z: number) => void;
    setOrientation?: (fx: number, fy: number, fz: number, ux: number, uy: number, uz: number) => void;
  };
  legacy.setPosition?.(position.x, position.y, position.z);
  legacy.setOrientation?.(forward.x, forward.y, forward.z, up.x, up.y, up.z);
}
