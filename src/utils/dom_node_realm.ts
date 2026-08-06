/**
 * Cross-realm DOM helpers. Detached multi-monitor popup windows are separate
 * JavaScript realms: `instanceof Node` / `instanceof HTMLElement` against the
 * main-window constructors always fails for popup nodes even when they are real
 * DOM nodes. Hit-testing and event routing must use structural checks instead.
 */

/**
 * Returns whether a value is a DOM Node without using cross-realm instanceof.
 *
 * @param value Candidate event target or node.
 * @returns True when the value exposes a numeric nodeType.
 */
export function isDomNodeLike(value: unknown): value is Node {
  if (!value || typeof value !== 'object') {
    return false;
  }
  return typeof (value as { nodeType?: unknown }).nodeType === 'number';
}

/**
 * Returns whether a surface element is the event target or an ancestor of it.
 * Safe for detached popup documents that fail main-realm instanceof.
 *
 * @param surface Registered chrome or viewport root.
 * @param target Event target from a browser pointer event.
 * @returns True when the target is the surface or lies inside it.
 */
export function doesElementContainEventTarget(surface: HTMLElement, target: EventTarget | null): boolean {
  if (!isDomNodeLike(target)) {
    return false;
  }
  if (surface === target) {
    return true;
  }
  try {
    return surface.contains(target);
  } catch {
    return false;
  }
}

/**
 * Resolves a Document from an event target without cross-realm instanceof.
 *
 * @param target Event currentTarget or target.
 * @returns Self document (nodeType 9) or ownerDocument, or null.
 */
export function resolveDocumentFromEventTarget(target: EventTarget | null): Document | null {
  if (!target || typeof target !== 'object') {
    return null;
  }
  const nodeLike = target as { nodeType?: number; ownerDocument?: Document | null };
  if (nodeLike.nodeType === 9) {
    return target as Document;
  }
  if (nodeLike.ownerDocument) {
    return nodeLike.ownerDocument;
  }
  return null;
}
