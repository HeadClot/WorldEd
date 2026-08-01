import { GizmoAxis } from '@/types/transform_mode.js';
import { TransformModalAxis } from './transform_modal_axis.js';

/**
 * Resolves the single axis used for modal numeric apply and guide lines.
 * Keyboard lock wins; otherwise a single-axis gizmo handle is used.
 *
 * @param modalAxis Keyboard axis lock.
 * @param handleAxis Active gizmo handle axis, or null.
 * @returns Modal axis lock representing the effective single axis, or None.
 */
export function transformModalEffectiveAxis(
  modalAxis: TransformModalAxis,
  handleAxis: GizmoAxis | null,
): TransformModalAxis {
  if (modalAxis !== TransformModalAxis.None) {
    return modalAxis;
  }
  return transformModalAxisFromGizmoAxis(handleAxis);
}

/**
 * Maps a gizmo handle axis to a modal single-axis lock.
 *
 * @param handleAxis Active gizmo handle axis, or null.
 * @returns Modal axis, or None for planes/view/null.
 */
export function transformModalAxisFromGizmoAxis(handleAxis: GizmoAxis | null): TransformModalAxis {
  if (handleAxis === GizmoAxis.X) return TransformModalAxis.X;
  if (handleAxis === GizmoAxis.Y) return TransformModalAxis.Y;
  if (handleAxis === GizmoAxis.Z) return TransformModalAxis.Z;
  return TransformModalAxis.None;
}

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
