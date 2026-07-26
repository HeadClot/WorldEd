import * as THREE from 'three';
import {
  computeCameraForwardSpawnPosition,
  computeOcclusionAwareSpawnPosition,
  DEFAULT_SPAWN_DISTANCE,
  snapPositionToGrid,
} from '../../navigation/object_spawn_placement.js';

export { snapPositionToGrid, DEFAULT_SPAWN_DISTANCE };

/**
 * Computes a world position for a new brush in front of the camera. Placement
 * is independent of existing brush count (no cascade offset). Prefer
 * {@link computeBrushSpawnPositionInScene} when a scene root is available so
 * placement stays on the camera side of walls.
 *
 * @param camera Active view camera (perspective or orthographic).
 * @param distance Distance along the view forward from the camera origin.
 * @returns World-space position for the brush center (unsnapped).
 */
export function computeBrushSpawnPosition(
  camera: THREE.Camera,
  distance: number = DEFAULT_SPAWN_DISTANCE,
): THREE.Vector3 {
  return computeCameraForwardSpawnPosition(camera, distance);
}

/**
 * Computes a grid-snapped world spawn for a brush using view-ray occlusion so
 * new brushes do not appear behind walls the camera is looking at.
 *
 * @param camera Active view camera.
 * @param raycastRoot World hierarchy used for occlusion tests.
 * @param gridInterval Grid step for snapping.
 * @param objectRadius Approximate brush half-extent for surface clearance.
 * @param preferredDistance Preferred open-space distance along the view ray.
 * @returns World-space snapped spawn position.
 */
export function computeBrushSpawnPositionInScene(
  camera: THREE.Camera,
  raycastRoot: THREE.Object3D,
  gridInterval: number,
  objectRadius: number = 1,
  preferredDistance: number = DEFAULT_SPAWN_DISTANCE,
): THREE.Vector3 {
  return computeOcclusionAwareSpawnPosition({
    camera,
    preferredDistance,
    gridInterval,
    raycastRoot,
    objectRadius,
  });
}
