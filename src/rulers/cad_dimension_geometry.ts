/**
 * Public facade for CAD dimension geometry builders.
 *
 * Implementation is split across:
 *
 * - `cad_dimension_types.ts` — segment/label types.
 * - `cad_dimension_primitives.ts` — axes, segments, classic dimensions.
 * - `cad_dimension_edge_placement.ts` — camera-facing edge placement.
 * - `cad_dimension_feedback.ts` — selection size and drag delta rulers.
 */

export type { CadLabelSpec, CadLineSegment } from './cad_dimension_types.js';
export {
  appendCadDimension,
  appendGhostBoxSegments,
  extractBoundsAxes,
  resolveCadOffsetScale,
} from './cad_dimension_primitives.js';
export { placeCameraFacingMeasuredEdge } from './cad_dimension_edge_placement.js';
export {
  appendResizeSizeDeltaDimensions,
  appendSelectionSizeDimensions,
  appendTransformDeltaDimensions,
} from './cad_dimension_feedback.js';
