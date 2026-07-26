import * as THREE from 'three';
import type { OrientedBoundsData } from '../transform/bounds/oriented_bounds.js';
import { formatCadDistance, formatCadSignedDelta } from './cad_ruler_format.js';
import {
  createFixedCadPlacementContext,
  writeDirectionTowardCamera,
  type CadPlacementContext,
} from './cad_placement_context.js';
import { CadRulerStyle } from './cad_ruler_style.js';
import { getCadViewPlaneAxes, isCadMeasureAxisVisible, type CadLocalAxis } from './cad_view_plane.js';
import { writeCameraViewFocusOnBounds } from './cad_view_focus.js';

/** One world-space line segment with solid start/end colors. */
export interface CadLineSegment {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  colorA: THREE.Color;
  colorB: THREE.Color;
}

/** Screen-projected label specification in world space. */
export interface CadLabelSpec {
  id: string;
  worldPosition: THREE.Vector3;
  text: string;
  colorCss: string;
}

/** Local principal axis index on an oriented bounds box (0=X, 1=Y-up, 2=Z). */
type LocalAxisIndex = CadLocalAxis;

const scratchCamRight = new THREE.Vector3();
const scratchCamUp = new THREE.Vector3();
const scratchAxisX = new THREE.Vector3();
const scratchAxisY = new THREE.Vector3();
const scratchAxisZ = new THREE.Vector3();
const scratchPointA = new THREE.Vector3();
const scratchPointB = new THREE.Vector3();
const scratchOutward = new THREE.Vector3();
const scratchDimA = new THREE.Vector3();
const scratchDimB = new THREE.Vector3();
const scratchMid = new THREE.Vector3();
const scratchWorkA = new THREE.Vector3();
const scratchWorkB = new THREE.Vector3();
const scratchToCamera = new THREE.Vector3();
const scratchEdgeCandidate = new THREE.Vector3();
const defaultTestCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);

/**
 * Resolves a legacy bounds-based scale. Prefer camera placement context for
 * live rendering; kept for tests that only need a positive number.
 *
 * @param halfExtents Oriented half extents.
 * @returns Small fixed stand-off independent of the longest edge.
 */
export function resolveCadOffsetScale(halfExtents: THREE.Vector3): number {
  const shortest = Math.min(halfExtents.x, halfExtents.y, halfExtents.z);
  const basis = Number.isFinite(shortest) && shortest > 1e-6 ? shortest : CadRulerStyle.minimumOffsetWorld;
  return THREE.MathUtils.clamp(basis * 0.15, CadRulerStyle.minimumOffsetWorld, 0.35);
}

/**
 * Extracts local axes of oriented bounds into world-space unit vectors. Local Y
 * is world-up when the bounds are unrotated (Unity-style Y-up).
 *
 * @param bounds Oriented bounds.
 * @param axisX Receives local +X in world space.
 * @param axisY Receives local +Y in world space.
 * @param axisZ Receives local +Z in world space.
 */
export function extractBoundsAxes(
  bounds: OrientedBoundsData,
  axisX: THREE.Vector3,
  axisY: THREE.Vector3,
  axisZ: THREE.Vector3,
): void {
  axisX.set(1, 0, 0).applyQuaternion(bounds.quaternion).normalize();
  axisY.set(0, 1, 0).applyQuaternion(bounds.quaternion).normalize();
  axisZ.set(0, 0, 1).applyQuaternion(bounds.quaternion).normalize();
}

/**
 * Builds the twelve edges of an oriented box wireframe.
 *
 * @param bounds Oriented bounds to outline.
 * @param color Vertex color for every edge.
 * @param segments Output segment list.
 */
export function appendGhostBoxSegments(
  bounds: OrientedBoundsData,
  color: THREE.Color,
  segments: CadLineSegment[],
): void {
  extractBoundsAxes(bounds, scratchAxisX, scratchAxisY, scratchAxisZ);
  const corners = buildBoxCorners(bounds.center, bounds.halfExtents, scratchAxisX, scratchAxisY, scratchAxisZ);
  const edges: Array<[number, number]> = [
    [0, 1],
    [1, 3],
    [3, 2],
    [2, 0],
    [4, 5],
    [5, 7],
    [7, 6],
    [6, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
  edges.forEach(([a, b]) => appendBoxEdge(segments, corners, a, b, color));
}

/**
 * Builds CAD size dimensions for the three principal extents of a bounds box.
 * Edges face the camera; stand-off is screen-stable so growing X does not push
 * the ruler farther down in Y.
 *
 * @param bounds Oriented selection bounds.
 * @param sizeColor Color for dimension lines.
 * @param extensionColor Color for extension legs pointing at corners.
 * @param labelColorCss CSS color for size labels.
 * @param segments Output line segments.
 * @param labels Output label specs.
 * @param placement Camera and screen-stable offset metrics.
 */
export function appendSelectionSizeDimensions(
  bounds: OrientedBoundsData,
  sizeColor: THREE.Color,
  extensionColor: THREE.Color,
  labelColorCss: string,
  segments: CadLineSegment[],
  labels: CadLabelSpec[],
  placement: CadPlacementContext = createFixedCadPlacementContext(defaultTestCamera),
): void {
  if (isCadMeasureAxisVisible(placement.viewPlane, 0)) {
    appendExteriorSizeDimension(
      bounds,
      0,
      'size-x',
      sizeColor,
      extensionColor,
      labelColorCss,
      placement,
      segments,
      labels,
    );
  }
  if (isCadMeasureAxisVisible(placement.viewPlane, 1)) {
    appendExteriorSizeDimension(
      bounds,
      1,
      'size-y',
      sizeColor,
      extensionColor,
      labelColorCss,
      placement,
      segments,
      labels,
    );
  }
  if (isCadMeasureAxisVisible(placement.viewPlane, 2)) {
    appendExteriorSizeDimension(
      bounds,
      2,
      'size-z',
      sizeColor,
      extensionColor,
      labelColorCss,
      placement,
      segments,
      labels,
    );
  }
}

/**
 * Builds translation delta feedback on the **trailing** face of each moved axis
 * (e.g. move +X → dimension on the left edge from old left to new left). Each
 * axis line is pure along that measure axis and rides the live brush on the
 * lateral axes, so diagonal moves never draw diagonal rulers or crossing
 * paths.
 *
 * @param startBounds Bounds at pointer-down.
 * @param currentBounds Live bounds after snap/move.
 * @param deltaColor Unused (kept for call-site stability).
 * @param axisColors RGB colors for X/Y/Z components.
 * @param labelColorCss CSS color for delta labels.
 * @param segments Output line segments.
 * @param labels Output label specs.
 * @param placement Camera and view-plane metrics.
 */
export function appendTransformDeltaDimensions(
  startBounds: OrientedBoundsData,
  currentBounds: OrientedBoundsData,
  deltaColor: THREE.Color,
  axisColors: { x: THREE.Color; y: THREE.Color; z: THREE.Color },
  labelColorCss: string,
  segments: CadLineSegment[],
  labels: CadLabelSpec[],
  placement: CadPlacementContext = createFixedCadPlacementContext(defaultTestCamera),
): void {
  const epsilon = CadRulerStyle.deltaDisplayEpsilon;
  const translation = scratchEdgeCandidate.copy(currentBounds.center).sub(startBounds.center);
  extractBoundsAxes(startBounds, scratchAxisX, scratchAxisY, scratchAxisZ);
  const localAxes = [scratchAxisX.clone(), scratchAxisY.clone(), scratchAxisZ.clone()];
  const colors = [axisColors.x, axisColors.y, axisColors.z];
  for (let axisIndex = 0; axisIndex < 3; axisIndex += 1) {
    const local = axisIndex as LocalAxisIndex;
    if (!isCadMeasureAxisVisible(placement.viewPlane, local)) continue;
    const component = translation.dot(localAxes[axisIndex]!);
    if (Math.abs(component) < epsilon) continue;
    appendTrailingFaceTravel(
      startBounds,
      currentBounds,
      local,
      component,
      colors[axisIndex]!,
      labelColorCss,
      segments,
      labels,
    );
  }
  void deltaColor;
}

/**
 * Builds resize feedback by measuring how far each local face traveled.
 *
 * @param startBounds Bounds at pointer-down.
 * @param currentBounds Live bounds while resizing.
 * @param sizeColor Color for face-travel dimension lines.
 * @param extensionColor Color for extension legs.
 * @param labelColorCss CSS color for delta labels.
 * @param segments Output line segments.
 * @param labels Output label specs.
 * @param placement Camera and screen-stable offset metrics.
 */
export function appendResizeSizeDeltaDimensions(
  startBounds: OrientedBoundsData,
  currentBounds: OrientedBoundsData,
  sizeColor: THREE.Color,
  extensionColor: THREE.Color,
  labelColorCss: string,
  segments: CadLineSegment[],
  labels: CadLabelSpec[],
  placement: CadPlacementContext = createFixedCadPlacementContext(defaultTestCamera),
): void {
  if (isCadMeasureAxisVisible(placement.viewPlane, 0)) {
    appendFaceTravelOnAxis(
      startBounds,
      currentBounds,
      0,
      sizeColor,
      extensionColor,
      labelColorCss,
      placement,
      segments,
      labels,
    );
  }
  if (isCadMeasureAxisVisible(placement.viewPlane, 1)) {
    appendFaceTravelOnAxis(
      startBounds,
      currentBounds,
      1,
      sizeColor,
      extensionColor,
      labelColorCss,
      placement,
      segments,
      labels,
    );
  }
  if (isCadMeasureAxisVisible(placement.viewPlane, 2)) {
    appendFaceTravelOnAxis(
      startBounds,
      currentBounds,
      2,
      sizeColor,
      extensionColor,
      labelColorCss,
      placement,
      segments,
      labels,
    );
  }
}

/**
 * Builds a classic CAD dimension. Extension legs start on the mesh edge when
 * gap is zero, forming a U/Π shape rather than a disconnected H.
 *
 * @param start Measured start point on the object edge.
 * @param end Measured end point on the object edge.
 * @param outwardDirection Unit direction pushing the dimension outside.
 * @param placement Screen-stable offset metrics.
 * @param lineColor Dimension line color.
 * @param extensionColor Extension leg color.
 * @param labelId Stable label id.
 * @param labelText Label text.
 * @param labelColorCss Label CSS color.
 * @param segments Output segments.
 * @param labels Output labels.
 */
export function appendCadDimension(
  start: THREE.Vector3,
  end: THREE.Vector3,
  outwardDirection: THREE.Vector3,
  placement: CadPlacementContext,
  lineColor: THREE.Color,
  extensionColor: THREE.Color,
  labelId: string,
  labelText: string,
  labelColorCss: string,
  segments: CadLineSegment[],
  labels: CadLabelSpec[],
): void {
  const offsetDistance = placement.offsetWorld;
  const gap = placement.gapWorld;
  const overshoot = placement.overshootWorld;
  scratchOutward.copy(outwardDirection).normalize();
  appendExtensionLeg(start, scratchOutward, gap, offsetDistance + overshoot, extensionColor, segments);
  appendExtensionLeg(end, scratchOutward, gap, offsetDistance + overshoot, extensionColor, segments);
  scratchDimA.copy(start).addScaledVector(scratchOutward, offsetDistance);
  scratchDimB.copy(end).addScaledVector(scratchOutward, offsetDistance);
  pushSegment(segments, scratchDimA, scratchDimB, lineColor, lineColor);
  labels.push({
    id: labelId,
    worldPosition: scratchMid.copy(scratchDimA).lerp(scratchDimB, 0.5).clone(),
    text: labelText,
    colorCss: labelColorCss,
  });
}

/**
 * Appends one exterior size dimension along a local principal axis.
 *
 * @param bounds Oriented bounds.
 * @param measureLocal Local axis measured (0=X, 1=Y, 2=Z).
 * @param labelId Stable label id.
 * @param sizeColor Dimension color.
 * @param extensionColor Extension color.
 * @param labelColorCss Label CSS color.
 * @param placement Placement context.
 * @param segments Output segments.
 * @param labels Output labels.
 */
function appendExteriorSizeDimension(
  bounds: OrientedBoundsData,
  measureLocal: LocalAxisIndex,
  labelId: string,
  sizeColor: THREE.Color,
  extensionColor: THREE.Color,
  labelColorCss: string,
  placement: CadPlacementContext,
  segments: CadLineSegment[],
  labels: CadLabelSpec[],
): void {
  const length = getHalfComponent(bounds.halfExtents, measureLocal) * 2;
  if (length < 1e-6) return;
  placeCameraFacingMeasuredEdge(
    bounds,
    measureLocal,
    placement.camera,
    scratchPointA,
    scratchPointB,
    scratchOutward,
    placement.viewPlane,
  );
  appendCadDimension(
    scratchPointA,
    scratchPointB,
    scratchOutward,
    placement,
    sizeColor,
    extensionColor,
    labelId,
    formatCadDistance(length),
    labelColorCss,
    segments,
    labels,
  );
}

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
  const measureAxis = axes[measureLocal]!;
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
  const offsetAxis = axes[offsetLocal]!;
  const depthAxis = axes[depthLocal]!;
  const halfOffset = getHalfComponent(bounds.halfExtents, offsetLocal);
  const halfDepth = getHalfComponent(bounds.halfExtents, depthLocal);
  writeDirectionTowardCamera(camera, bounds.center, scratchToCamera);
  const depthSign: 1 | -1 = depthAxis.dot(scratchToCamera) >= 0 ? 1 : -1;
  // Closer of the two silhouette edges (±offset) to the camera.
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
  const axisA = axes[sideA]!;
  const axisB = axes[sideB]!;
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
function computeExteriorScreenOutward(
  measureAxis: THREE.Vector3,
  viewDir: THREE.Vector3,
  boundsCenter: THREE.Vector3,
  edgeMid: THREE.Vector3,
  outOutward: THREE.Vector3,
  camera: THREE.Camera,
): void {
  outOutward.copy(edgeMid).sub(boundsCenter);
  outOutward.addScaledVector(measureAxis, -outOutward.dot(measureAxis));
  // Keep a small depth component removed so labels sit beside the edge on screen.
  const depth = outOutward.dot(viewDir);
  outOutward.addScaledVector(viewDir, -depth);
  if (outOutward.lengthSq() < 1e-10) {
    // Edge is on the face we're looking straight at — offset sideways on screen.
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

/**
 * Builds a screen-plane outward for delta/resize leaders (perp to view).
 *
 * @param measureAxis Unit measured direction.
 * @param viewDir Camera look direction.
 * @param boundsCenter Reference center.
 * @param edgeMid Segment midpoint.
 * @param outOutward Receives unit outward.
 * @param camera Viewport camera.
 */
function computeScreenPlaneOutward(
  measureAxis: THREE.Vector3,
  viewDir: THREE.Vector3,
  boundsCenter: THREE.Vector3,
  edgeMid: THREE.Vector3,
  outOutward: THREE.Vector3,
  camera: THREE.Camera,
): void {
  computeExteriorScreenOutward(measureAxis, viewDir, boundsCenter, edgeMid, outOutward, camera);
}

/**
 * Appends face-travel dimensions for both faces of one local axis.
 *
 * @param startBounds Bounds at drag start.
 * @param currentBounds Live bounds.
 * @param axisLocal Local axis of the faces.
 * @param sizeColor Dimension color.
 * @param extensionColor Extension color.
 * @param labelColorCss Label CSS color.
 * @param placement Placement context.
 * @param segments Output segments.
 * @param labels Output labels.
 */
function appendFaceTravelOnAxis(
  startBounds: OrientedBoundsData,
  currentBounds: OrientedBoundsData,
  axisLocal: LocalAxisIndex,
  sizeColor: THREE.Color,
  extensionColor: THREE.Color,
  labelColorCss: string,
  placement: CadPlacementContext,
  segments: CadLineSegment[],
  labels: CadLabelSpec[],
): void {
  extractBoundsAxes(currentBounds, scratchAxisX, scratchAxisY, scratchAxisZ);
  const axis = [scratchAxisX, scratchAxisY, scratchAxisZ][axisLocal]!;
  const startHalf = getHalfComponent(startBounds.halfExtents, axisLocal);
  const currentHalf = getHalfComponent(currentBounds.halfExtents, axisLocal);
  appendOneFaceTravel(
    startBounds.center,
    currentBounds.center,
    axis,
    startHalf,
    currentHalf,
    1,
    `resize-pos-${axisLocal}`,
    sizeColor,
    extensionColor,
    labelColorCss,
    placement,
    segments,
    labels,
  );
  appendOneFaceTravel(
    startBounds.center,
    currentBounds.center,
    axis,
    startHalf,
    currentHalf,
    -1,
    `resize-neg-${axisLocal}`,
    sizeColor,
    extensionColor,
    labelColorCss,
    placement,
    segments,
    labels,
  );
}

/**
 * Draws a CAD dimension between a face's start and current position when the
 * face center moved more than epsilon.
 *
 * @param startCenter Start bounds center.
 * @param currentCenter Current bounds center.
 * @param axis Local unit axis of the face pair.
 * @param startHalf Start half-extent on axis.
 * @param currentHalf Current half-extent on axis.
 * @param faceSign +1 for positive face, -1 for negative face.
 * @param labelId Stable label id.
 * @param sizeColor Dimension color.
 * @param extensionColor Extension color.
 * @param labelColorCss Label CSS color.
 * @param placement Placement context.
 * @param segments Output segments.
 * @param labels Output labels.
 */
function appendOneFaceTravel(
  startCenter: THREE.Vector3,
  currentCenter: THREE.Vector3,
  axis: THREE.Vector3,
  startHalf: number,
  currentHalf: number,
  faceSign: 1 | -1,
  labelId: string,
  sizeColor: THREE.Color,
  extensionColor: THREE.Color,
  labelColorCss: string,
  placement: CadPlacementContext,
  segments: CadLineSegment[],
  labels: CadLabelSpec[],
): void {
  scratchPointA.copy(startCenter).addScaledVector(axis, faceSign * startHalf);
  scratchPointB.copy(currentCenter).addScaledVector(axis, faceSign * currentHalf);
  const travel = scratchEdgeCandidate.copy(scratchPointB).sub(scratchPointA);
  const signed = travel.dot(axis) * faceSign;
  if (Math.abs(signed) < 1e-6) return;
  placement.camera.getWorldDirection(scratchCamRight);
  const mid = scratchMid.copy(scratchPointA).lerp(scratchPointB, 0.5);
  computeScreenPlaneOutward(axis, scratchCamRight, currentCenter, mid, scratchOutward, placement.camera);
  appendCadDimension(
    scratchPointA,
    scratchPointB,
    scratchOutward,
    placement,
    sizeColor,
    extensionColor,
    labelId,
    formatCadSignedDelta(signed),
    labelColorCss,
    segments,
    labels,
  );
}

/**
 * Draws pure-axis travel of the trailing face for one local axis (opposite the
 * move). Moving +X shows min-X: start measure → live measure, both at the live
 * brush lateral position so the ruler follows the brush without going
 * diagonal.
 *
 * @param startBounds Bounds at drag start.
 * @param currentBounds Live bounds.
 * @param axisLocal Local axis of travel.
 * @param signedMove Signed move along that local axis.
 * @param color Dimension color.
 * @param labelColorCss Label CSS color.
 * @param segments Output segments.
 * @param labels Output labels.
 */
function appendTrailingFaceTravel(
  startBounds: OrientedBoundsData,
  currentBounds: OrientedBoundsData,
  axisLocal: LocalAxisIndex,
  signedMove: number,
  color: THREE.Color,
  labelColorCss: string,
  segments: CadLineSegment[],
  labels: CadLabelSpec[],
): void {
  writeTrailingFaceEndpoints(startBounds, currentBounds, axisLocal, signedMove, scratchPointA, scratchPointB);
  pushSegment(segments, scratchPointA, scratchPointB, color, color);
  const labelIds: Record<LocalAxisIndex, string> = { 0: 'delta-x', 1: 'delta-y', 2: 'delta-z' };
  labels.push({
    id: labelIds[axisLocal],
    worldPosition: scratchMid.copy(scratchPointA).lerp(scratchPointB, 0.5).clone(),
    text: formatCadSignedDelta(signedMove),
    colorCss: labelColorCss,
  });
}

/**
 * Writes axis-aligned trailing-face travel endpoints for one local axis. Both
 * ends share the live brush lateral position; only the measure component spans
 * from the start pose to the live pose (never a diagonal face-center path).
 *
 * @param startBounds Bounds at drag start.
 * @param currentBounds Live bounds.
 * @param axisLocal Local axis of travel.
 * @param signedMove Signed move along that local axis.
 * @param outStart Receives start measure at live lateral position.
 * @param outEnd Receives live trailing-face center.
 */
function writeTrailingFaceEndpoints(
  startBounds: OrientedBoundsData,
  currentBounds: OrientedBoundsData,
  axisLocal: LocalAxisIndex,
  signedMove: number,
  outStart: THREE.Vector3,
  outEnd: THREE.Vector3,
): void {
  extractBoundsAxes(startBounds, scratchAxisX, scratchAxisY, scratchAxisZ);
  const axis = [scratchAxisX, scratchAxisY, scratchAxisZ][axisLocal]!;
  const half = getHalfComponent(startBounds.halfExtents, axisLocal);
  const trailingSign: 1 | -1 = signedMove >= 0 ? -1 : 1;
  outEnd.copy(currentBounds.center).addScaledVector(axis, trailingSign * half);
  outStart.copy(outEnd).addScaledVector(axis, -signedMove);
}

/**
 * Appends one extension leg from the measured point outward.
 *
 * @param point Measured corner or edge point.
 * @param outward Outward unit direction.
 * @param gap Start gap away from the object (0 connects to the mesh).
 * @param length Full outward length including overshoot.
 * @param color Extension color.
 * @param segments Output segments.
 */
function appendExtensionLeg(
  point: THREE.Vector3,
  outward: THREE.Vector3,
  gap: number,
  length: number,
  color: THREE.Color,
  segments: CadLineSegment[],
): void {
  scratchWorkA.copy(point).addScaledVector(outward, gap);
  scratchWorkB.copy(point).addScaledVector(outward, length);
  const tip = color.clone().multiplyScalar(0.55);
  pushSegment(segments, scratchWorkA, scratchWorkB, color, tip);
}

/**
 * Builds the eight corners of an oriented box in fixed binary order.
 *
 * @param center Box center.
 * @param halfExtents Local half extents.
 * @param axisX World X axis.
 * @param axisY World Y axis.
 * @param axisZ World Z axis.
 * @returns Corner positions.
 */
function buildBoxCorners(
  center: THREE.Vector3,
  halfExtents: THREE.Vector3,
  axisX: THREE.Vector3,
  axisY: THREE.Vector3,
  axisZ: THREE.Vector3,
): THREE.Vector3[] {
  const corners: THREE.Vector3[] = [];
  for (let ix = 0; ix < 2; ix += 1) {
    for (let iy = 0; iy < 2; iy += 1) {
      for (let iz = 0; iz < 2; iz += 1) {
        const sx = ix === 0 ? -1 : 1;
        const sy = iy === 0 ? -1 : 1;
        const sz = iz === 0 ? -1 : 1;
        corners.push(
          center
            .clone()
            .addScaledVector(axisX, sx * halfExtents.x)
            .addScaledVector(axisY, sy * halfExtents.y)
            .addScaledVector(axisZ, sz * halfExtents.z),
        );
      }
    }
  }
  return corners;
}

/**
 * Appends one box edge between two corner indices.
 *
 * @param segments Output segments.
 * @param corners Corner array.
 * @param indexA Start corner index.
 * @param indexB End corner index.
 * @param color Edge color.
 */
function appendBoxEdge(
  segments: CadLineSegment[],
  corners: THREE.Vector3[],
  indexA: number,
  indexB: number,
  color: THREE.Color,
): void {
  pushSegment(segments, corners[indexA]!, corners[indexB]!, color, color);
}

/**
 * Pushes one colored segment from two points.
 *
 * @param segments Output list.
 * @param a Start point.
 * @param b End point.
 * @param colorA Start color.
 * @param colorB End color.
 */
function pushSegment(
  segments: CadLineSegment[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  colorA: THREE.Color,
  colorB: THREE.Color,
): void {
  segments.push({
    ax: a.x,
    ay: a.y,
    az: a.z,
    bx: b.x,
    by: b.y,
    bz: b.z,
    colorA,
    colorB,
  });
}

/**
 * Returns the next local axis index (0→1→2→0).
 *
 * @param axis Current axis.
 * @returns Next axis.
 */
function nextAxis(axis: LocalAxisIndex): LocalAxisIndex {
  if (axis === 0) return 1;
  if (axis === 1) return 2;
  return 0;
}

/**
 * Reads a half-extent component by local axis index.
 *
 * @param halfExtents Half extents vector.
 * @param axis Local axis.
 * @returns Component value.
 */
function getHalfComponent(halfExtents: THREE.Vector3, axis: LocalAxisIndex): number {
  if (axis === 0) return halfExtents.x;
  if (axis === 1) return halfExtents.y;
  return halfExtents.z;
}
