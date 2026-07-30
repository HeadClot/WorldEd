import * as THREE from 'three';
import type { DataOrientedBounds } from '@/transform/bounds/builder_oriented_bounds.js';
import { formatCadDistance, formatCadSignedDelta } from '@/rulers/system/cad_ruler_format.js';
import { createFixedCadPlacementContext, type CadPlacementContext } from './cad_placement_context.js';
import { CadRulerStyle } from '@/rulers/system/cad_ruler_style.js';
import { isCadMeasureAxisVisible } from '@/rulers/view/cad_view_plane.js';
import type { CadLabelSpec, CadLineSegment, LocalAxisIndex } from './cad_dimension_types.js';
import { placeCameraFacingMeasuredEdge, computeExteriorScreenOutward } from './cad_dimension_edge_placement.js';
import {
  appendCadDimension,
  defaultTestCamera,
  extractBoundsAxes,
  getHalfComponent,
  pushSegment,
  scratchAxisX,
  scratchAxisY,
  scratchAxisZ,
  scratchCamRight,
  scratchEdgeCandidate,
  scratchMid,
  scratchOutward,
  scratchPointA,
  scratchPointB,
} from './cad_dimension_primitives.js';

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
  bounds: DataOrientedBounds,
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
 * Builds translation delta feedback on the trailing face of each moved axis
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
  startBounds: DataOrientedBounds,
  currentBounds: DataOrientedBounds,
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
    const axis = localAxes[axisIndex];
    const color = colors[axisIndex];
    if (!axis || !color) continue;
    const component = translation.dot(axis);
    if (Math.abs(component) < epsilon) continue;
    appendTrailingFaceTravel(startBounds, currentBounds, local, component, color, labelColorCss, segments, labels);
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
  startBounds: DataOrientedBounds,
  currentBounds: DataOrientedBounds,
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
  bounds: DataOrientedBounds,
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
  startBounds: DataOrientedBounds,
  currentBounds: DataOrientedBounds,
  axisLocal: LocalAxisIndex,
  sizeColor: THREE.Color,
  extensionColor: THREE.Color,
  labelColorCss: string,
  placement: CadPlacementContext,
  segments: CadLineSegment[],
  labels: CadLabelSpec[],
): void {
  extractBoundsAxes(currentBounds, scratchAxisX, scratchAxisY, scratchAxisZ);
  const axis = [scratchAxisX, scratchAxisY, scratchAxisZ][axisLocal];
  if (!axis) return;
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
  computeExteriorScreenOutward(axis, scratchCamRight, currentCenter, mid, scratchOutward, placement.camera);
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
  startBounds: DataOrientedBounds,
  currentBounds: DataOrientedBounds,
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
  startBounds: DataOrientedBounds,
  currentBounds: DataOrientedBounds,
  axisLocal: LocalAxisIndex,
  signedMove: number,
  outStart: THREE.Vector3,
  outEnd: THREE.Vector3,
): void {
  extractBoundsAxes(startBounds, scratchAxisX, scratchAxisY, scratchAxisZ);
  const axis = [scratchAxisX, scratchAxisY, scratchAxisZ][axisLocal];
  if (!axis) return;
  const half = getHalfComponent(startBounds.halfExtents, axisLocal);
  const trailingSign: 1 | -1 = signedMove >= 0 ? -1 : 1;
  outEnd.copy(currentBounds.center).addScaledVector(axis, trailingSign * half);
  outStart.copy(outEnd).addScaledVector(axis, -signedMove);
}
