import * as THREE from 'three';

/**
 * Distance-to-scale factor for perspective cameras. Keeps unit helper geometry
 * (transform gizmos, align previews, etc.) a stable on-screen size.
 */
export const VIEWPORT_CONSTANT_SCREEN_PERSPECTIVE_DISTANCE_SCALE = 0.065;

/**
 * Orthographic frustum-height-to-scale factor. Keeps unit helper geometry a
 * stable fraction of the view height as the user zooms 2D panes.
 */
export const VIEWPORT_CONSTANT_SCREEN_ORTHOGRAPHIC_FRUSTUM_SCALE = 0.08;

/** Floor for perspective helper scale (close-up fly camera). */
export const VIEWPORT_CONSTANT_SCREEN_PERSPECTIVE_MIN_SCALE = 0.5;

/** Floor for orthographic helper scale (heavy 2D zoom-in). */
export const VIEWPORT_CONSTANT_SCREEN_ORTHOGRAPHIC_MIN_SCALE = 0.05;

/**
 * Computes a world-space scale so unit-sized helpers stay readable on screen.
 * Perspective uses camera distance to the pivot; orthographic uses frustum
 * height so zoom does not leave fixed world-size helpers enormous.
 *
 * @param camera Camera driving the current view.
 * @param pivot World-space helper origin (selection center, hover point, etc.).
 * @returns Positive scalar applied to a helper group's scale.
 */
export function computeViewportConstantScreenScale(camera: THREE.Camera, pivot: THREE.Vector3): number {
  if (camera instanceof THREE.OrthographicCamera) {
    return computeOrthographicConstantScreenScale(camera);
  }
  return computePerspectiveConstantScreenScale(camera, pivot);
}

/**
 * Scales helpers from orthographic frustum height (zoom).
 *
 * @param camera Active orthographic camera.
 * @returns World scale for a unit helper group.
 */
function computeOrthographicConstantScreenScale(camera: THREE.OrthographicCamera): number {
  const frustumHeight = Math.abs(camera.top - camera.bottom);
  return Math.max(
    VIEWPORT_CONSTANT_SCREEN_ORTHOGRAPHIC_MIN_SCALE,
    frustumHeight * VIEWPORT_CONSTANT_SCREEN_ORTHOGRAPHIC_FRUSTUM_SCALE,
  );
}

/**
 * Scales helpers from perspective camera distance to the pivot.
 *
 * @param camera Active perspective (or unknown) camera.
 * @param pivot World-space helper origin.
 * @returns World scale for a unit helper group.
 */
function computePerspectiveConstantScreenScale(camera: THREE.Camera, pivot: THREE.Vector3): number {
  const distance = camera.position.distanceTo(pivot);
  return Math.max(
    VIEWPORT_CONSTANT_SCREEN_PERSPECTIVE_MIN_SCALE,
    distance * VIEWPORT_CONSTANT_SCREEN_PERSPECTIVE_DISTANCE_SCALE,
  );
}
