import { GizmoAxis } from '@/types/transform_mode.js';
import { TransformModalAxis } from './transform_modal_axis.js';

/**
 * Maps a modal axis lock to a gizmo axis enum when locked.
 *
 * @param modalAxis Modal axis lock.
 * @returns Gizmo axis, or null when unlocked.
 */
export function transformModalAxisToGizmoAxis(modalAxis: TransformModalAxis): GizmoAxis | null {
  if (modalAxis === TransformModalAxis.X) return GizmoAxis.X;
  if (modalAxis === TransformModalAxis.Y) return GizmoAxis.Y;
  if (modalAxis === TransformModalAxis.Z) return GizmoAxis.Z;
  return null;
}
