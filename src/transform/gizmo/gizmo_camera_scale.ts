import * as THREE from 'three';

/**
 * Distance-to-scale factor for perspective cameras. Matches the historical
 * translate/rotate/scale gizmo sizing so 3D views keep their familiar size.
 */
export const GIZMO_PERSPECTIVE_DISTANCE_SCALE = 0.065;

/**
 * Orthographic frustum-height-to-scale factor. Keeps unit gizmo geometry a
 * stable fraction of the view height as the user zooms 2D panes.
 */
export const GIZMO_ORTHOGRAPHIC_FRUSTUM_SCALE = 0.08;

/** Floor for perspective gizmo scale (close-up fly camera). */
export const GIZMO_PERSPECTIVE_MIN_SCALE = 0.5;

/** Floor for orthographic gizmo scale (heavy 2D zoom-in). */
export const GIZMO_ORTHOGRAPHIC_MIN_SCALE = 0.05;

/**
 * Computes the world-space scale for translate/rotate/scale gizmo groups so
 * handles stay readable. Perspective uses camera distance; orthographic uses
 * frustum height so zoom does not leave a fixed world-size gizmo enormous.
 *
 * @param camera Camera driving the current view (or a representative pane).
 * @param pivot World-space gizmo pivot (selection center).
 * @returns Positive scalar applied to the gizmo group scale.
 */
export function computeGizmoCameraScale(camera: THREE.Camera, pivot: THREE.Vector3): number {
  if (camera instanceof THREE.OrthographicCamera) {
    return computeOrthographicGizmoScale(camera);
  }
  return computePerspectiveGizmoScale(camera, pivot);
}

/**
 * Scales the gizmo from orthographic frustum height (zoom).
 *
 * @param camera Active orthographic camera.
 * @returns World scale for the gizmo group.
 */
function computeOrthographicGizmoScale(camera: THREE.OrthographicCamera): number {
  const frustumHeight = Math.abs(camera.top - camera.bottom);
  return Math.max(GIZMO_ORTHOGRAPHIC_MIN_SCALE, frustumHeight * GIZMO_ORTHOGRAPHIC_FRUSTUM_SCALE);
}

/**
 * Scales the gizmo from perspective camera distance to the pivot.
 *
 * @param camera Active perspective (or unknown) camera.
 * @param pivot World-space gizmo pivot.
 * @returns World scale for the gizmo group.
 */
function computePerspectiveGizmoScale(camera: THREE.Camera, pivot: THREE.Vector3): number {
  const distance = camera.position.distanceTo(pivot);
  return Math.max(GIZMO_PERSPECTIVE_MIN_SCALE, distance * GIZMO_PERSPECTIVE_DISTANCE_SCALE);
}
