import type { EditorServices } from '@/editor/window/editor_services.js';

/**
 * Applies a single-click object selection using the shared click-through stack
 * resolution (Shape Editor BoxSelectTool non-marquee GlobalMouseUp path).
 *
 * @param services Editor services for pick and selection mutation.
 * @param clientX Pointer client X at mouse up.
 * @param clientY Pointer client Y at mouse up.
 * @param additive True when Shift is held.
 * @param toggle True when Ctrl/Meta is held.
 */
export function boxSelectApplyClickSelection(
  services: EditorServices,
  clientX: number,
  clientY: number,
  additive: boolean,
  toggle: boolean,
): void {
  services.applyObjectClickSelectionAtClientPoint(clientX, clientY, additive, toggle);
}
