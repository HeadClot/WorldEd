import { TransformMode } from '@/types/transform_mode.js';
import { TransformModalAxis, transformModalAxisIsLocked } from './transform_modal_axis.js';

/**
 * Builds a short status-bar label for the modal axis lock and typed value.
 *
 * @param mode Active transform mode.
 * @param axis Keyboard axis lock.
 * @param typedText Raw numeric buffer text.
 * @returns Status string, or empty when nothing modal is active.
 */
export function transformModalStatusText(mode: TransformMode, axis: TransformModalAxis, typedText: string): string {
  const modeLabel = transformModalModeLabel(mode);
  const axisLabel = transformModalAxisLabel(axis);
  if (!transformModalAxisIsLocked(axis) && typedText.length === 0) {
    return '';
  }
  if (typedText.length === 0) {
    return `${modeLabel} ${axisLabel}`;
  }
  if (!transformModalAxisIsLocked(axis)) {
    return `${modeLabel} ${typedText}`;
  }
  return `${modeLabel} ${axisLabel} ${typedText}`;
}

/**
 * Returns a short mode label for modal status text.
 *
 * @param mode Active transform mode.
 * @returns Display label.
 */
function transformModalModeLabel(mode: TransformMode): string {
  if (mode === TransformMode.TRANSLATE) return 'Move';
  if (mode === TransformMode.ROTATE) return 'Rotate';
  if (mode === TransformMode.SCALE) return 'Scale';
  return 'Bounds';
}

/**
 * Returns an axis letter for status text.
 *
 * @param axis Modal axis lock.
 * @returns X, Y, Z, or empty.
 */
function transformModalAxisLabel(axis: TransformModalAxis): string {
  if (axis === TransformModalAxis.X) return 'X';
  if (axis === TransformModalAxis.Y) return 'Y';
  if (axis === TransformModalAxis.Z) return 'Z';
  return '';
}
