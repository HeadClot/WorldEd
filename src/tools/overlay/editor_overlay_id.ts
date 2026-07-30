/**
 * Named editor overlays that tools can suppress without hard-coding each other.
 * Add new overlays here as shared UI surfaces grow.
 */
export enum EditorOverlayId {
  /** Selection size dimensions (CAD bounds rulers). */
  CAD_BOUNDS_RULERS = 'cad_bounds_rulers',
}
