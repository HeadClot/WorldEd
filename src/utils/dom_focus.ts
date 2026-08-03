/**
 * Removes focus from an active form field so keyboard input returns to the app.
 * Safe to call when nothing is focused or focus is not a form control.
 */
export function blurActiveFormField(): void {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return;
  if (!isFormFieldElement(active)) return;
  active.blur();
}

/**
 * Moves keyboard focus onto a host element so chrome controls stop receiving
 * key events and focus styles. Makes the host programmatically focusable when
 * needed.
 *
 * @param focusTarget Element that should own keyboard focus.
 */
export function claimDomKeyboardFocus(focusTarget: HTMLElement): void {
  ensureElementIsProgrammaticallyFocusable(focusTarget);
  blurActiveElementIfDifferent(focusTarget);
  focusTarget.focus({ preventScroll: true });
}

/**
 * Ensures an element can receive programmatic focus without joining tab order.
 *
 * @param element Element that must accept .focus().
 */
function ensureElementIsProgrammaticallyFocusable(element: HTMLElement): void {
  if (element.hasAttribute('tabindex')) {
    return;
  }
  element.tabIndex = -1;
}

/**
 * Blurs the document active element when it is not already the focus target.
 *
 * @param focusTarget Element that should keep focus if already active.
 */
function blurActiveElementIfDifferent(focusTarget: HTMLElement): void {
  const active = focusTarget.ownerDocument.activeElement;
  if (!(active instanceof HTMLElement)) {
    return;
  }
  if (active === focusTarget) {
    return;
  }
  active.blur();
}

/**
 * Returns whether an element is a form field that captures typing.
 *
 * @param element Element to test.
 * @returns True for input, textarea, select, or contenteditable.
 */
function isFormFieldElement(element: HTMLElement): boolean {
  const tag = element.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return element.isContentEditable === true;
}
