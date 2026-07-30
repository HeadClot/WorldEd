import * as THREE from 'three';
import { DEFAULT_PERSPECTIVE_CAMERA_OFFSET } from '@/types/editor_config.js';

/**
 * Returns the world-space point cameras should frame on startup. Matches the
 * default unit brush center at the world origin.
 *
 * @returns A new vector at the origin.
 */
export function getDefaultSceneFocus(): THREE.Vector3 {
  return new THREE.Vector3(0, 0, 0);
}

/**
 * Returns the default perspective camera world position on the (1,1,1) diagonal
 * from the origin.
 *
 * @returns A new camera position vector.
 */
export function getDefaultPerspectiveCameraPosition(): THREE.Vector3 {
  const offset = DEFAULT_PERSPECTIVE_CAMERA_OFFSET;
  return new THREE.Vector3(offset, offset, offset);
}

/**
 * Returns the front (XY) orthographic camera world position, centered on the
 * origin like the top view.
 *
 * @param distance Distance along +Z from the origin.
 * @returns A new camera position vector.
 */
export function getDefaultFrontCameraPosition(distance: number = 50): THREE.Vector3 {
  return new THREE.Vector3(0, 0, distance);
}

/**
 * Returns the side (YZ) orthographic camera world position, centered on the
 * origin like the top view.
 *
 * @param distance Distance along +X from the origin.
 * @returns A new camera position vector.
 */
export function getDefaultSideCameraPosition(distance: number = 50): THREE.Vector3 {
  return new THREE.Vector3(distance, 0, 0);
}

/**
 * Returns the top (XZ) orthographic camera world position.
 *
 * @param distance Distance along +Y from the origin.
 * @returns A new camera position vector.
 */
export function getDefaultTopCameraPosition(distance: number = 50): THREE.Vector3 {
  return new THREE.Vector3(0, distance, 0);
}
