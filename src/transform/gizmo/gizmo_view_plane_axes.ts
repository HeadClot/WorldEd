import { getHiddenBoundsAxesForViewPlane, type CadViewPlane } from '@/rulers/view/cad_view_plane.js';
import { GizmoAxis } from '@/types/transform_mode.js';

/**
 * Returns whether a translate/scale axis handle should be hidden for a view
 * plane. In Global mode, orthographic panes hide the depth axis (TOP: Y, FRONT:
 * Z, SIDE: X). Local mode keeps every axis so object-local directions remain
 * usable.
 *
 * @param axis Handle axis.
 * @param viewPlane Pane view plane (`xyz` = perspective).
 * @param hideDepthAxes True in Global transform space; false in Local.
 * @returns True when the handle must not be shown or picked.
 */
export function isGizmoAxisHiddenInViewPlane(
  axis: GizmoAxis,
  viewPlane: CadViewPlane,
  hideDepthAxes: boolean,
): boolean {
  if (!hideDepthAxes) return false;
  if (viewPlane === 'xyz') return false;
  if (axis !== GizmoAxis.X && axis !== GizmoAxis.Y && axis !== GizmoAxis.Z) return false;
  const hidden = getHiddenBoundsAxesForViewPlane(viewPlane);
  return hidden.includes(axis);
}
