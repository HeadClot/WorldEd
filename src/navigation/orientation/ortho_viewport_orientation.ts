import * as THREE from 'three';
import { ViewportKind } from '@/viewports/core/viewport_kind.js';
import type { EditorPlaneFrame } from './editor_orientation_basis.js';
import type { EditorOrientationWorldBasis } from './editor_orientation_edge_align.js';

/** Default look distance when the camera is degenerate against the grid origin. */
const DEFAULT_ORTHO_LOOK_DISTANCE = 50;

/** Look direction and up vector for an orthographic viewport kind. */
export interface OrthoViewAxes {
  lookDirection: THREE.Vector3;
  up: THREE.Vector3;
}

/**
 * Resolves working-frame look and up for a Top / Front / Side viewport.
 *
 * @param kind Orthographic viewport kind.
 * @param basis Working-frame world basis (X right, Y up, Z depth).
 * @returns Unit look direction (toward the scene) and camera up.
 */
export function resolveOrthoViewAxes(kind: ViewportKind, basis: EditorOrientationWorldBasis): OrthoViewAxes {
  if (kind === ViewportKind.TOP) {
    return {
      lookDirection: basis.yAxis.clone().negate().normalize(),
      up: basis.zAxis.clone().negate().normalize(),
    };
  }
  if (kind === ViewportKind.FRONT) {
    return {
      lookDirection: basis.zAxis.clone().negate().normalize(),
      up: basis.yAxis.clone().normalize(),
    };
  }
  return {
    lookDirection: basis.xAxis.clone().negate().normalize(),
    up: basis.yAxis.clone().normalize(),
  };
}

/**
 * Builds the 2D grid plane frame for an orthographic kind in the working frame.
 *
 * @param kind Orthographic viewport kind.
 * @param basis Working-frame world basis.
 * @param planeOrigin Grid lattice origin.
 * @returns Plane frame with U/V on the view plane and normal along view depth.
 */
export function buildOrthoGridPlaneFrame(
  kind: ViewportKind,
  basis: EditorOrientationWorldBasis,
  planeOrigin: THREE.Vector3,
): EditorPlaneFrame {
  if (kind === ViewportKind.TOP) {
    return {
      origin: planeOrigin.clone(),
      uAxis: basis.xAxis.clone().normalize(),
      vAxis: basis.zAxis.clone().normalize(),
      normal: basis.yAxis.clone().normalize(),
    };
  }
  if (kind === ViewportKind.FRONT) {
    return {
      origin: planeOrigin.clone(),
      uAxis: basis.xAxis.clone().normalize(),
      vAxis: basis.yAxis.clone().normalize(),
      normal: basis.zAxis.clone().normalize(),
    };
  }
  return {
    origin: planeOrigin.clone(),
    uAxis: basis.zAxis.clone().normalize(),
    vAxis: basis.yAxis.clone().normalize(),
    normal: basis.xAxis.clone().normalize(),
  };
}

/**
 * Reorients an orthographic camera to Top / Front / Side of the working frame
 * while keeping the world point under the view center and look distance.
 *
 * @param camera Orthographic camera to update.
 * @param kind Orthographic viewport kind.
 * @param basis Working-frame world basis.
 * @param planeOrigin Grid plane origin used to measure look distance.
 */
export function reorientOrthographicCamera(
  camera: THREE.OrthographicCamera,
  kind: ViewportKind,
  basis: EditorOrientationWorldBasis,
  planeOrigin: THREE.Vector3,
): void {
  const focus = resolveOrthographicFocusPoint(camera, planeOrigin);
  const lookDistance = resolveOrthographicLookDistance(camera, planeOrigin, focus);
  const axes = resolveOrthoViewAxes(kind, basis);
  camera.up.copy(axes.up);
  camera.position.copy(focus).addScaledVector(axes.lookDirection, -lookDistance);
  camera.lookAt(focus);
  camera.updateMatrixWorld(true);
}

/**
 * Finds the world point currently under the orthographic view center.
 *
 * @param camera Orthographic camera.
 * @param planeOrigin Fallback plane origin when distance is unusable.
 * @returns World focus point.
 */
function resolveOrthographicFocusPoint(camera: THREE.OrthographicCamera, planeOrigin: THREE.Vector3): THREE.Vector3 {
  const lookDirection = new THREE.Vector3();
  camera.getWorldDirection(lookDirection);
  const lookDistance = measureLookDistanceAlongDirection(camera, planeOrigin, lookDirection);
  return camera.position.clone().addScaledVector(lookDirection, lookDistance);
}

/**
 * Resolves a positive look distance to reapply after reorientation.
 *
 * @param camera Orthographic camera.
 * @param planeOrigin Grid plane origin.
 * @param focus Resolved focus point.
 * @returns Positive distance from camera to focus.
 */
function resolveOrthographicLookDistance(
  camera: THREE.OrthographicCamera,
  planeOrigin: THREE.Vector3,
  focus: THREE.Vector3,
): number {
  const distance = camera.position.distanceTo(focus);
  if (distance > 1e-3) {
    return distance;
  }
  const lookDirection = new THREE.Vector3();
  camera.getWorldDirection(lookDirection);
  return measureLookDistanceAlongDirection(camera, planeOrigin, lookDirection);
}

/**
 * Measures look distance from the camera to the plane through the origin along
 * the current look direction.
 *
 * @param camera Orthographic camera.
 * @param planeOrigin Plane origin.
 * @param lookDirection Unit look direction.
 * @returns Positive look distance.
 */
function measureLookDistanceAlongDirection(
  camera: THREE.OrthographicCamera,
  planeOrigin: THREE.Vector3,
  lookDirection: THREE.Vector3,
): number {
  const offset = camera.position.clone().sub(planeOrigin);
  const distance = -offset.dot(lookDirection);
  if (distance > 1e-3) {
    return distance;
  }
  return DEFAULT_ORTHO_LOOK_DISTANCE;
}
