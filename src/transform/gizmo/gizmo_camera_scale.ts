import type * as THREE from 'three';
import {
  computeViewportConstantScreenScale,
  VIEWPORT_CONSTANT_SCREEN_ORTHOGRAPHIC_FRUSTUM_SCALE,
  VIEWPORT_CONSTANT_SCREEN_ORTHOGRAPHIC_MIN_SCALE,
  VIEWPORT_CONSTANT_SCREEN_PERSPECTIVE_DISTANCE_SCALE,
  VIEWPORT_CONSTANT_SCREEN_PERSPECTIVE_MIN_SCALE,
} from '@/viewports/scale/viewport_constant_screen_scale.js';

/**
 * Distance-to-scale factor for perspective cameras. Matches the historical
 * translate/rotate/scale gizmo sizing so 3D views keep their familiar size.
 */
export const GIZMO_PERSPECTIVE_DISTANCE_SCALE = VIEWPORT_CONSTANT_SCREEN_PERSPECTIVE_DISTANCE_SCALE;

/**
 * Orthographic frustum-height-to-scale factor. Keeps unit gizmo geometry a
 * stable fraction of the view height as the user zooms 2D panes.
 */
export const GIZMO_ORTHOGRAPHIC_FRUSTUM_SCALE = VIEWPORT_CONSTANT_SCREEN_ORTHOGRAPHIC_FRUSTUM_SCALE;

/** Floor for perspective gizmo scale (close-up fly camera). */
export const GIZMO_PERSPECTIVE_MIN_SCALE = VIEWPORT_CONSTANT_SCREEN_PERSPECTIVE_MIN_SCALE;

/** Floor for orthographic gizmo scale (heavy 2D zoom-in). */
export const GIZMO_ORTHOGRAPHIC_MIN_SCALE = VIEWPORT_CONSTANT_SCREEN_ORTHOGRAPHIC_MIN_SCALE;

/**
 * Computes the world-space scale for translate/rotate/scale gizmo groups so
 * handles stay readable. Delegates to the shared viewport constant-screen scale
 * helper used by other editor overlays.
 *
 * @param camera Camera driving the current view (or a representative pane).
 * @param pivot World-space gizmo pivot (selection center).
 * @returns Positive scalar applied to the gizmo group scale.
 */
export function computeGizmoCameraScale(camera: THREE.Camera, pivot: THREE.Vector3): number {
  return computeViewportConstantScreenScale(camera, pivot);
}
