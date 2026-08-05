/** Axis along which a parent area is divided into two children. */
export type AreaSplitDirection = 'horizontal' | 'vertical';

/**
 * Returns whether a value is a valid split direction.
 *
 * @param value Candidate string.
 * @returns True when the value is horizontal or vertical.
 */
export function isAreaSplitDirection(value: unknown): value is AreaSplitDirection {
  return value === 'horizontal' || value === 'vertical';
}
