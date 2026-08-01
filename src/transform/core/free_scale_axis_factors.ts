import * as THREE from 'three';

/**
 * Builds per-axis free-scale factors for the scale center cube (or single-use
 * free S). Perspective and single-use use uniform XYZ. Orthographic free-scale
 * keeps the view depth axis unscaled (2D planar scale).
 *
 * @param factor Radial scale factor from drag start.
 * @param camera Active drag camera, or null.
 * @param forceUniformThreeAxes When true, always scale X/Y/Z (single-use S).
 * @returns Multipliers applied to local scale and pivot offset (1 = unchanged).
 */
export function freeScaleAxisFactors(
  factor: number,
  camera: THREE.Camera | null,
  forceUniformThreeAxes: boolean,
): THREE.Vector3 {
  if (forceUniformThreeAxes || !camera || !(camera instanceof THREE.OrthographicCamera)) {
    return new THREE.Vector3(factor, factor, factor);
  }
  return planarFreeScaleAxisFactors(factor, camera);
}

/**
 * Scales only the two orthographic view-plane axes; depth stays at 1.
 *
 * @param factor Radial scale factor.
 * @param camera Orthographic camera for the active pane.
 * @returns Axis multipliers with depth fixed at 1.
 */
function planarFreeScaleAxisFactors(factor: number, camera: THREE.OrthographicCamera): THREE.Vector3 {
  const depth = new THREE.Vector3();
  camera.getWorldDirection(depth);
  const absX = Math.abs(depth.x);
  const absY = Math.abs(depth.y);
  const absZ = Math.abs(depth.z);
  const factors = new THREE.Vector3(factor, factor, factor);
  if (absY >= absX && absY >= absZ) {
    factors.y = 1;
    return factors;
  }
  if (absZ >= absX && absZ >= absY) {
    factors.z = 1;
    return factors;
  }
  factors.x = 1;
  return factors;
}
