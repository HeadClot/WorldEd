import type { EditorServices } from '@/editor/window/editor_services.js';
import type { Vector2 } from 'three';

/**
 * Returns whether the pointer has moved far enough from the press position to
 * arm marquee selection (Shape Editor 3px threshold).
 *
 * @param mouseInitialPosition Screen position at mouse down.
 * @param mousePosition Current screen position.
 * @returns True when marquee should activate.
 */
export function boxSelectShouldArmMarquee(mouseInitialPosition: Vector2, mousePosition: Vector2): boolean {
  return mouseInitialPosition.distanceTo(mousePosition) > 3.0;
}

/**
 * Applies marquee selection between the initial and current mouse grid/screen
 * positions stored on the editor mouse state.
 *
 * @param services Editor services for marquee selection mutation.
 * @param initialClientX Client X at mouse down.
 * @param initialClientY Client Y at mouse down.
 * @param currentClientX Client X at mouse up.
 * @param currentClientY Client Y at mouse up.
 * @param subtractive True when Ctrl marquee removes from selection.
 */
export function boxSelectApplyMarqueeSelection(
  services: EditorServices,
  initialClientX: number,
  initialClientY: number,
  currentClientX: number,
  currentClientY: number,
  subtractive: boolean,
): void {
  const minX = Math.min(initialClientX, currentClientX);
  const minY = Math.min(initialClientY, currentClientY);
  const maxX = Math.max(initialClientX, currentClientX);
  const maxY = Math.max(initialClientY, currentClientY);
  services.applyObjectMarqueeSelection(minX, minY, maxX, maxY, subtractive);
}
