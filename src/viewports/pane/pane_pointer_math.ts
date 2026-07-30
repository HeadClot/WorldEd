import * as THREE from 'three';
import { pointerEventToNdc } from '@/utils/pointer_ndc.js';

/**
 * Converts a pointer event into NDC for a pane content element. Prefer this
 * over the full canvas so multi-view scissors pick with the correct camera.
 *
 * @param event Pointer or mouse event.
 * @param contentElement Pane content DOM element that defines the view.
 * @param target Optional Vector2 to write into.
 * @returns NDC coordinates for the pane.
 */
export function pointerEventToPaneNdc(
  event: MouseEvent,
  contentElement: HTMLElement,
  target: THREE.Vector2 = new THREE.Vector2(),
): THREE.Vector2 {
  return pointerEventToNdc(event, contentElement, target);
}

/**
 * Returns whether a client point lies inside a content element.
 *
 * @param clientX Window X coordinate.
 * @param clientY Window Y coordinate.
 * @param contentElement Pane content element.
 * @returns True when the point is inside the element bounds.
 */
export function isClientPointInPane(clientX: number, clientY: number, contentElement: HTMLElement): boolean {
  const rect = contentElement.getBoundingClientRect();
  return clientX >= rect.left && clientX < rect.right && clientY >= rect.top && clientY < rect.bottom;
}
