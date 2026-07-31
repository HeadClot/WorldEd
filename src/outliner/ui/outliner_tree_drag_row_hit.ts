/** CSS class on each outliner row used for pointer hit testing. */
export const OUTLINER_ROW_ELEMENT_CLASS = 'editor-outliner-row';

/**
 * Returns the element stack under a viewport point. Prefers
 * {@link Document.elementsFromPoint} so drag ghosts do not hide rows; falls back
 * to {@link Document.elementFromPoint} or an empty stack in limited DOMs.
 *
 * @param clientX Pointer X in viewport coordinates.
 * @param clientY Pointer Y in viewport coordinates.
 * @returns Top-to-bottom element stack under the point.
 */
export function outlinerElementsFromPointDefault(clientX: number, clientY: number): Element[] {
  if (typeof document.elementsFromPoint === 'function') {
    return document.elementsFromPoint(clientX, clientY);
  }
  if (typeof document.elementFromPoint === 'function') {
    const topElement = document.elementFromPoint(clientX, clientY);
    return topElement ? [topElement] : [];
  }
  return [];
}

/**
 * Finds the outliner row element under a viewport point. Uses
 * {@link Document.elementsFromPoint} so drag ghosts and the insert line do not
 * block the real row underneath.
 *
 * @param clientX Pointer X in viewport coordinates.
 * @param clientY Pointer Y in viewport coordinates.
 * @param elementsFromPointImpl Stack lookup (injectable for tests).
 * @returns Row element, or null when no outliner row is under the point.
 */
export function outlinerRowElementFromPointerResolve(
  clientX: number,
  clientY: number,
  elementsFromPointImpl: (x: number, y: number) => Element[] = outlinerElementsFromPointDefault,
): HTMLElement | null {
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
    return null;
  }
  const elementStack = elementsFromPointImpl(clientX, clientY);
  return outlinerRowElementFromElementStackResolve(elementStack);
}

/**
 * Walks an elements-from-point stack and returns the first outliner row.
 *
 * @param elementStack Elements from topmost to bottommost under the pointer.
 * @returns Row element, or null when none are present.
 */
export function outlinerRowElementFromElementStackResolve(elementStack: readonly Element[]): HTMLElement | null {
  for (const element of elementStack) {
    const rowElement = outlinerRowElementFromNodeResolve(element);
    if (rowElement) {
      return rowElement;
    }
  }
  return null;
}

/**
 * Returns the outliner row ancestor of a DOM node, if any.
 *
 * @param node Node under the pointer (or a descendant of a row).
 * @returns Row element, or null when the node is outside any row.
 */
export function outlinerRowElementFromNodeResolve(node: Node): HTMLElement | null {
  if (!(node instanceof Element)) {
    return null;
  }
  const rowElement = node.closest(`.${OUTLINER_ROW_ELEMENT_CLASS}`);
  if (!(rowElement instanceof HTMLElement)) {
    return null;
  }
  return rowElement;
}
