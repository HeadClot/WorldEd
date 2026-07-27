import * as THREE from 'three';
import type { OrientedBoundsData } from '../transform/bounds/oriented_bounds.js';
import { writeDirectionTowardCamera, type CadPlacementContext } from './cad_placement_context.js';
import { getCadViewPlaneAxes } from './cad_view_plane.js';
import { writeCameraViewFocusOnBounds } from './cad_view_focus.js';
import type { LocalAxisIndex } from './cad_dimension_types.js';
import {
  extractBoundsAxes,
  getHalfComponent,
  nextAxis,
  scratchAxisX,
  scratchAxisY,
  scratchAxisZ,
  scratchCamRight,
  scratchCamUp,
  scratchEdgeCandidate,
  scratchMid,
  scratchToCamera,
  scratchWorkA,
  scratchWorkB,
} from './cad_dimension_primitives.js';

/**
 * Places a measured edge for size dimensions. Perspective uses view-ray focus
 * (including inside-bounds far hit). Orthographic 2D picks the closer of the
 * two silhouette edges and flips if the preferred edge is off-screen.
 *
 * @param bounds Oriented bounds.
 * @param measureLocal Local measure axis.
 * @param camera Viewport camera.
 * @param outStart Receives world start of the measured edge.
 * @param outEnd Receives world end of the measured edge.
 * @param outOutward Receives unit outward offset direction.
 * @param viewPlane View plane (`xyz` = 3D view-ray path).
 */
export function placeCameraFacingMeasuredEdge(
  bounds: OrientedBoundsData,
  measureLocal: LocalAxisIndex,
  camera: THREE.Camera,
  outStart: THREE.Vector3,
  outEnd: THREE.Vector3,
  outOutward: THREE.Vector3,
  viewPlane: CadPlacementContext['viewPlane'] = 'xyz',
): void {
  extractBoundsAxes(bounds, scratchAxisX, scratchAxisY, scratchAxisZ);
  const axes = [scratchAxisX, scratchAxisY, scratchAxisZ];
  const measureAxis = axes[measureLocal];
  if (!measureAxis) return;
  const halfMeasure = getHalfComponent(bounds.halfExtents, measureLocal);
  if (viewPlane !== 'xyz') {
    placeOrthoSilhouetteEdge(
      bounds,
      measureLocal,
      measureAxis,
      halfMeasure,
      axes,
      camera,
      viewPlane,
      outStart,
      outEnd,
      outOutward,
    );
    return;
  }
  placePerspectiveViewRayEdge(
    bounds,
    measureLocal,
    measureAxis,
    halfMeasure,
    axes,
    camera,
    outStart,
    outEnd,
    outOutward,
  );
}

/**
 * Ortho 2D placement: among the two edges parallel to the measure axis, pick
 * the one closer to the camera in the view plane; if that edge is off-screen,
 * flip to the opposite edge.
 *
 * @param bounds Oriented bounds.
 * @param measureLocal Measured local axis.
 * @param measureAxis World measure direction.
 * @param halfMeasure Half length.
 * @param axes Local world axes.
 * @param camera Orthographic camera.
 * @param viewPlane Active grid plane.
 * @param outStart Edge start.
 * @param outEnd Edge end.
 * @param outOutward Exterior stand-off.
 */
function placeOrthoSilhouetteEdge(
  bounds: OrientedBoundsData,
  measureLocal: LocalAxisIndex,
  measureAxis: THREE.Vector3,
  halfMeasure: number,
  axes: THREE.Vector3[],
  camera: THREE.Camera,
  viewPlane: CadPlacementContext['viewPlane'],
  outStart: THREE.Vector3,
  outEnd: THREE.Vector3,
  outOutward: THREE.Vector3,
): void {
  const plane = getCadViewPlaneAxes(viewPlane);
  if (plane.depthAxis === null) return;
  const offsetLocal: LocalAxisIndex = measureLocal === plane.axisU ? plane.axisV : plane.axisU;
  const depthLocal = plane.depthAxis;
  const offsetAxis = axes[offsetLocal];
  const depthAxis = axes[depthLocal];
  if (!offsetAxis || !depthAxis) return;
  const halfOffset = getHalfComponent(bounds.halfExtents, offsetLocal);
  const halfDepth = getHalfComponent(bounds.halfExtents, depthLocal);
  writeDirectionTowardCamera(camera, bounds.center, scratchToCamera);
  const depthSign: 1 | -1 = depthAxis.dot(scratchToCamera) >= 0 ? 1 : -1;
  let offsetSign = pickCloserOffsetSign(bounds.center, offsetAxis, halfOffset, camera);
  writeOrthoEdgeEndpoints(
    bounds.center,
    measureAxis,
    halfMeasure,
    offsetAxis,
    offsetSign,
    halfOffset,
    depthAxis,
    depthSign,
    halfDepth,
    outStart,
    outEnd,
  );
  scratchMid.copy(outStart).lerp(outEnd, 0.5);
  if (!isWorldPointRoughlyOnScreen(scratchMid, camera)) {
    offsetSign = offsetSign === 1 ? -1 : 1;
    writeOrthoEdgeEndpoints(
      bounds.center,
      measureAxis,
      halfMeasure,
      offsetAxis,
      offsetSign,
      halfOffset,
      depthAxis,
      depthSign,
      halfDepth,
      outStart,
      outEnd,
    );
  }
  outOutward.copy(offsetAxis).multiplyScalar(offsetSign);
}

/**
 * Picks ±offset so the edge is closer to the camera in world space.
 *
 * @param center Bounds center.
 * @param offsetAxis Silhouette normal axis.
 * @param halfOffset Half extent on offset.
 * @param camera Viewport camera.
 * @returns Preferred offset sign.
 */
function pickCloserOffsetSign(
  center: THREE.Vector3,
  offsetAxis: THREE.Vector3,
  halfOffset: number,
  camera: THREE.Camera,
): 1 | -1 {
  scratchWorkA.copy(center).addScaledVector(offsetAxis, halfOffset);
  scratchWorkB.copy(center).addScaledVector(offsetAxis, -halfOffset);
  const distPos = camera.position.distanceToSquared(scratchWorkA);
  const distNeg = camera.position.distanceToSquared(scratchWorkB);
  return distPos <= distNeg ? 1 : -1;
}

/**
 * Writes endpoints for an ortho silhouette edge.
 *
 * @param center Bounds center.
 * @param measureAxis Measure direction.
 * @param halfMeasure Half measure.
 * @param offsetAxis Offset axis.
 * @param offsetSign Offset sign.
 * @param halfOffset Half offset.
 * @param depthAxis Depth axis.
 * @param depthSign Depth sign.
 * @param halfDepth Half depth.
 * @param outStart Start point.
 * @param outEnd End point.
 */
function writeOrthoEdgeEndpoints(
  center: THREE.Vector3,
  measureAxis: THREE.Vector3,
  halfMeasure: number,
  offsetAxis: THREE.Vector3,
  offsetSign: 1 | -1,
  halfOffset: number,
  depthAxis: THREE.Vector3,
  depthSign: 1 | -1,
  halfDepth: number,
  outStart: THREE.Vector3,
  outEnd: THREE.Vector3,
): void {
  outStart
    .copy(center)
    .addScaledVector(measureAxis, -halfMeasure)
    .addScaledVector(offsetAxis, offsetSign * halfOffset)
    .addScaledVector(depthAxis, depthSign * halfDepth);
  outEnd
    .copy(center)
    .addScaledVector(measureAxis, halfMeasure)
    .addScaledVector(offsetAxis, offsetSign * halfOffset)
    .addScaledVector(depthAxis, depthSign * halfDepth);
}

/**
 * Returns whether a world point projects roughly inside the camera frustum.
 *
 * @param point World point.
 * @param camera Viewport camera.
 * @returns True when NDC is near the visible range.
 */
function isWorldPointRoughlyOnScreen(point: THREE.Vector3, camera: THREE.Camera): boolean {
  scratchEdgeCandidate.copy(point).project(camera);
  if (!Number.isFinite(scratchEdgeCandidate.x) || !Number.isFinite(scratchEdgeCandidate.y)) {
    return false;
  }
  return (
    Math.abs(scratchEdgeCandidate.x) <= 1.05 &&
    Math.abs(scratchEdgeCandidate.y) <= 1.05 &&
    scratchEdgeCandidate.z >= -1 &&
    scratchEdgeCandidate.z <= 1
  );
}

/**
 * Perspective placement using view-ray focus on the solid (near outside, far
 * inside).
 *
 * @param bounds Oriented bounds.
 * @param measureLocal Measured local axis.
 * @param measureAxis World measure direction.
 * @param halfMeasure Half length.
 * @param axes Local world axes.
 * @param camera Perspective camera.
 * @param outStart Edge start.
 * @param outEnd Edge end.
 * @param outOutward Exterior stand-off.
 */
function placePerspectiveViewRayEdge(
  bounds: OrientedBoundsData,
  measureLocal: LocalAxisIndex,
  measureAxis: THREE.Vector3,
  halfMeasure: number,
  axes: THREE.Vector3[],
  camera: THREE.Camera,
  outStart: THREE.Vector3,
  outEnd: THREE.Vector3,
  outOutward: THREE.Vector3,
): void {
  const sideA = nextAxis(measureLocal);
  const sideB = nextAxis(sideA);
  const axisA = axes[sideA];
  const axisB = axes[sideB];
  if (!axisA || !axisB) return;
  const halfA = getHalfComponent(bounds.halfExtents, sideA);
  const halfB = getHalfComponent(bounds.halfExtents, sideB);
  writeCameraViewFocusOnBounds(camera, bounds, scratchEdgeCandidate);
  camera.getWorldDirection(scratchCamRight);
  scratchWorkA.copy(scratchEdgeCandidate).sub(bounds.center);
  scratchWorkA.addScaledVector(measureAxis, -scratchWorkA.dot(measureAxis));
  if (scratchWorkA.lengthSq() < 1e-10) {
    writeDirectionTowardCamera(camera, bounds.center, scratchToCamera);
    scratchWorkA.copy(scratchToCamera);
    scratchWorkA.addScaledVector(measureAxis, -scratchWorkA.dot(measureAxis));
  }
  if (scratchWorkA.lengthSq() < 1e-10) {
    scratchCamUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    scratchWorkA.copy(scratchCamUp);
    scratchWorkA.addScaledVector(measureAxis, -scratchWorkA.dot(measureAxis));
  }
  if (scratchWorkA.lengthSq() < 1e-10) {
    scratchWorkA.copy(axisA);
  }
  const signA = resolveAxisSign(axisA, scratchWorkA, camera);
  const signB = resolveAxisSign(axisB, scratchWorkA, camera);
  outStart
    .copy(bounds.center)
    .addScaledVector(measureAxis, -halfMeasure)
    .addScaledVector(axisA, signA * halfA)
    .addScaledVector(axisB, signB * halfB);
  outEnd
    .copy(bounds.center)
    .addScaledVector(measureAxis, halfMeasure)
    .addScaledVector(axisA, signA * halfA)
    .addScaledVector(axisB, signB * halfB);
  scratchMid.copy(outStart).lerp(outEnd, 0.5);
  computeExteriorScreenOutward(measureAxis, scratchCamRight, bounds.center, scratchMid, outOutward, camera);
}

/**
 * Resolves ±1 for a lateral axis from the preferred look-focus direction. Uses
 * camera up/right only as a tie-break when the preference is edge-on.
 *
 * @param axis World unit lateral axis.
 * @param prefer Direction in the lateral plane toward the viewed surface.
 * @param camera Viewport camera.
 * @returns Face sign for that axis.
 */
function resolveAxisSign(axis: THREE.Vector3, prefer: THREE.Vector3, camera: THREE.Camera): 1 | -1 {
  const alignment = axis.dot(prefer);
  if (Math.abs(alignment) > 1e-6) {
    return alignment >= 0 ? 1 : -1;
  }
  scratchCamUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  const upAlign = axis.dot(scratchCamUp);
  if (Math.abs(upAlign) > 1e-6) {
    return upAlign >= 0 ? 1 : -1;
  }
  scratchCamRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  return axis.dot(scratchCamRight) >= 0 ? 1 : -1;
}

/**
 * Builds an exterior stand-off that stays visible on screen: from the solid
 * center through the chosen edge, with the view-depth component removed.
 *
 * @param measureAxis Unit measured edge direction.
 * @param viewDir Camera look direction.
 * @param boundsCenter Bounds center.
 * @param edgeMid Chosen edge midpoint.
 * @param outOutward Receives unit outward direction.
 * @param camera Viewport camera.
 */
export function computeExteriorScreenOutward(
  measureAxis: THREE.Vector3,
  viewDir: THREE.Vector3,
  boundsCenter: THREE.Vector3,
  edgeMid: THREE.Vector3,
  outOutward: THREE.Vector3,
  camera: THREE.Camera,
): void {
  outOutward.copy(edgeMid).sub(boundsCenter);
  outOutward.addScaledVector(measureAxis, -outOutward.dot(measureAxis));
  const depth = outOutward.dot(viewDir);
  outOutward.addScaledVector(viewDir, -depth);
  if (outOutward.lengthSq() < 1e-10) {
    outOutward.copy(measureAxis).cross(viewDir);
  }
  if (outOutward.lengthSq() < 1e-10) {
    scratchCamUp.setFromMatrixColumn(camera.matrixWorld, 1);
    outOutward.copy(measureAxis).cross(scratchCamUp);
  }
  if (outOutward.lengthSq() < 1e-10) {
    outOutward.set(0, 1, 0);
  } else {
    outOutward.normalize();
  }
}
