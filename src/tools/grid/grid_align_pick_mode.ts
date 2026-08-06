import type { EditorOrientationAxisId } from '@/navigation/orientation/editor_orientation_axis.js';

/** Armed pick mode for grid and camera orientation tools. */
export type GridAlignPickMode =
  'none' | 'grid_face' | 'grid_edge_x' | 'grid_edge_y' | 'grid_edge_z' | 'grid_origin_vertex' | 'camera_face';

/**
 * Returns whether the mode expects a face click.
 *
 * @param mode Armed pick mode.
 * @returns True for grid or camera face align.
 */
export function gridAlignPickModeIsFace(mode: GridAlignPickMode): boolean {
  return mode === 'grid_face' || mode === 'camera_face';
}

/**
 * Returns whether the mode expects an edge click.
 *
 * @param mode Armed pick mode.
 * @returns True for grid edge X/Y/Z.
 */
export function gridAlignPickModeIsEdge(mode: GridAlignPickMode): boolean {
  return mode === 'grid_edge_x' || mode === 'grid_edge_y' || mode === 'grid_edge_z';
}

/**
 * Returns whether the mode expects a vertex click for lattice origin.
 *
 * @param mode Armed pick mode.
 * @returns True for origin-to-vertex.
 */
export function gridAlignPickModeIsVertexOrigin(mode: GridAlignPickMode): boolean {
  return mode === 'grid_origin_vertex';
}

/**
 * Maps an edge pick mode to a working-frame axis.
 *
 * @param mode Edge pick mode.
 * @returns Axis id, or null when mode is not an edge mode.
 */
export function gridAlignPickModeToAxis(mode: GridAlignPickMode): EditorOrientationAxisId | null {
  if (mode === 'grid_edge_x') {
    return 'x';
  }
  if (mode === 'grid_edge_y') {
    return 'y';
  }
  if (mode === 'grid_edge_z') {
    return 'z';
  }
  return null;
}

/**
 * Builds an edge pick mode from a working-frame axis.
 *
 * @param axis Working-frame axis.
 * @returns Edge pick mode.
 */
export function gridAlignPickModeFromAxis(axis: EditorOrientationAxisId): GridAlignPickMode {
  if (axis === 'x') {
    return 'grid_edge_x';
  }
  if (axis === 'y') {
    return 'grid_edge_y';
  }
  return 'grid_edge_z';
}
