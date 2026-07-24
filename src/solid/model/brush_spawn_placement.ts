import * as THREE from 'three';

/** Default distance ahead of the camera for new brush placement. */
const DEFAULT_SPAWN_DISTANCE = 8;

/** Fallback grid interval when snap settings are unavailable or invalid. */
const FALLBACK_GRID_INTERVAL = 1;

/**
 * Computes a world position for a new brush in front of the camera. Placement
 * is independent of existing brush count (no cascade offset). Callers snap in
 * model-local space after converting from world.
 *
 * @param camera Active view camera (perspective or orthographic).
 * @param distance Distance along the view forward from the camera origin.
 * @returns World-space position for the brush center (unsnapped).
 */
export function computeBrushSpawnPosition(
  camera: THREE.Camera,
  distance: number = DEFAULT_SPAWN_DISTANCE,
): THREE.Vector3 {
  const position = new THREE.Vector3();
  const forward = new THREE.Vector3();
  camera.getWorldPosition(position);
  camera.getWorldDirection(forward);
  if (forward.lengthSq() < 1e-12) {
    forward.set(0, 0, -1);
  } else {
    forward.normalize();
  }
  position.addScaledVector(forward, Math.max(distance, 0));
  return position;
}

/**
 * Snaps a position to the nearest grid cell on each axis.
 *
 * @param position Position modified in place.
 * @param gridInterval Grid step (non-positive values leave the position
 *   unchanged).
 */
export function snapPositionToGrid(position: THREE.Vector3, gridInterval: number): void {
  const interval = Number.isFinite(gridInterval) && gridInterval > 0 ? gridInterval : FALLBACK_GRID_INTERVAL;
  position.x = Math.round(position.x / interval) * interval;
  position.y = Math.round(position.y / interval) * interval;
  position.z = Math.round(position.z / interval) * interval;
}
