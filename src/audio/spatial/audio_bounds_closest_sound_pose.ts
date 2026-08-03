import * as THREE from 'three';
import type { Camera } from 'three';
import type { AudioSpatialMode } from './audio_viewport_focus.js';
import type { AudioSpatialPlaybackPose } from './audio_spatial_bus.js';

/**
 * Resolves mono vs spatial placement for selection-bound snap feedback. Outside
 * the selection AABB the source sits on the closest bounds point (3D stereo).
 * Inside the AABB the source is co-located with the listener (2D mono surround
 * illusion). Orthographic viewports always force mono.
 *
 * @param viewportMode Spatial mode from the last interacted viewport.
 * @param camera Active camera (listener pose for 3D).
 * @param selectionBounds World AABB of the current selection, or null.
 * @param fallbackSourcePosition Source used when no bounds are available.
 * @returns Pose for the spatial bus.
 */
export function resolveBoundsClosestSoundPose(
  viewportMode: AudioSpatialMode,
  camera: Camera | null,
  selectionBounds: THREE.Box3 | null,
  fallbackSourcePosition: THREE.Vector3,
): AudioSpatialPlaybackPose {
  if (viewportMode === 'mono' || !camera) {
    return createMonoPose(camera, fallbackSourcePosition);
  }
  if (!selectionBounds || selectionBounds.isEmpty()) {
    return createSpatialPose(camera, fallbackSourcePosition);
  }
  return resolvePoseFromSelectionBounds(camera, selectionBounds);
}

/**
 * Builds a mono pose (2D viewport or forced mono).
 *
 * @param camera Optional camera (still useful for listener sync later).
 * @param sourcePosition Fallback source position.
 * @returns Mono playback pose.
 */
function createMonoPose(camera: Camera | null, sourcePosition: THREE.Vector3): AudioSpatialPlaybackPose {
  return {
    mode: 'mono',
    camera,
    sourcePosition: sourcePosition.clone(),
  };
}

/**
 * Builds a spatial3d pose at the given world source.
 *
 * @param camera Perspective camera for the listener.
 * @param sourcePosition World sound position.
 * @returns Spatial playback pose.
 */
function createSpatialPose(camera: Camera, sourcePosition: THREE.Vector3): AudioSpatialPlaybackPose {
  return {
    mode: 'spatial3d',
    camera,
    sourcePosition: sourcePosition.clone(),
  };
}

/**
 * Places the source at the closest point on the selection AABB to the camera
 * listener. Inside the box → mono at the listener.
 *
 * @param camera Perspective camera.
 * @param selectionBounds World selection AABB.
 * @returns Playback pose for inside/outside the volume.
 */
function resolvePoseFromSelectionBounds(camera: Camera, selectionBounds: THREE.Box3): AudioSpatialPlaybackPose {
  const listenerPosition = new THREE.Vector3();
  camera.getWorldPosition(listenerPosition);
  if (selectionBounds.containsPoint(listenerPosition)) {
    return createMonoPose(camera, listenerPosition);
  }
  const closestOnBounds = new THREE.Vector3();
  selectionBounds.clampPoint(listenerPosition, closestOnBounds);
  return createSpatialPose(camera, closestOnBounds);
}

/**
 * Expands a world AABB from the given objects (typically the selection).
 *
 * @param objects Selected scene objects.
 * @returns World AABB, or null when no objects produce a finite box.
 */
export function computeWorldBoundsFromObjects(objects: readonly THREE.Object3D[]): THREE.Box3 | null {
  if (objects.length === 0) {
    return null;
  }
  const bounds = new THREE.Box3();
  let hasValidBox = false;
  const objectBox = new THREE.Box3();
  for (let index = 0; index < objects.length; index++) {
    const object = objects[index];
    if (!object) {
      continue;
    }
    object.updateWorldMatrix(true, false);
    objectBox.setFromObject(object);
    if (objectBox.isEmpty()) {
      continue;
    }
    if (!hasValidBox) {
      bounds.copy(objectBox);
      hasValidBox = true;
      continue;
    }
    bounds.union(objectBox);
  }
  return hasValidBox ? bounds : null;
}
