import type { GridPlane } from '../viewports/grid/grid_plane.js';

/** Local axis index: 0 = X, 1 = Y (up), 2 = Z. */
export type CadLocalAxis = 0 | 1 | 2;

/**
 * View plane for CAD placement. `'xyz'` means full 3D (perspective); otherwise
 * an orthographic grid plane with a hidden depth axis.
 */
export type CadViewPlane = GridPlane | 'xyz';

/**
 * Returns the two in-plane local axes and the depth axis for a view plane.
 *
 * @param plane View plane (`xz` top, `xy` front, `yz` side, or full 3D).
 * @returns Axis indices for U, V, and depth.
 */
export function getCadViewPlaneAxes(plane: CadViewPlane): {
  axisU: CadLocalAxis;
  axisV: CadLocalAxis;
  depthAxis: CadLocalAxis | null;
} {
  if (plane === 'xz') {
    return { axisU: 0, axisV: 2, depthAxis: 1 };
  }
  if (plane === 'xy') {
    return { axisU: 0, axisV: 1, depthAxis: 2 };
  }
  if (plane === 'yz') {
    return { axisU: 1, axisV: 2, depthAxis: 0 };
  }
  return { axisU: 0, axisV: 1, depthAxis: null };
}

/**
 * Returns whether a local size axis should be drawn in this view.
 *
 * @param plane View plane.
 * @param measureLocal Local axis of the size dimension.
 * @returns False for the orthographic depth axis.
 */
export function isCadMeasureAxisVisible(plane: CadViewPlane, measureLocal: CadLocalAxis): boolean {
  const { depthAxis } = getCadViewPlaneAxes(plane);
  if (depthAxis === null) return true;
  return measureLocal !== depthAxis;
}

/**
 * Returns world-axis letters hidden for bounds handles in a view.
 *
 * @param plane View plane.
 * @returns Axis letters to hide, or empty for 3D.
 */
export function getHiddenBoundsAxesForViewPlane(plane: CadViewPlane): ReadonlyArray<'x' | 'y' | 'z'> {
  if (plane === 'xz') return ['y'];
  if (plane === 'xy') return ['z'];
  if (plane === 'yz') return ['x'];
  return [];
}
