import type { Camera } from 'three';
import type { EditorServices } from '../window/editor_services.js';
import type { EditorWindow } from '../window/editor_window.js';
import type { EditorViewportPickContext } from '../window/editor_viewport_pick_context.js';

/** Camera, pick element, and client pointer for a single-use drag sample. */
export interface SingleUseViewportPointerContext {
  camera: Camera;
  pickElement: HTMLElement;
  clientX: number;
  clientY: number;
}

/**
 * Resolves the interactive pane and client coordinates for single-use start or
 * live drag, preferring the pointer's owner document (main or detached).
 *
 * @param editor Editor window owning last pointer state.
 * @param services Map-editor services.
 * @returns Pane and pointer context, or null when no interactive pane exists.
 */
export function resolveSingleUseViewportPointerContext(
  editor: EditorWindow,
  services: EditorServices,
): SingleUseViewportPointerContext | null {
  const ownerDocument = editor.lastPointerOwnerDocument;
  const knownPointer = resolveKnownClientPointer(editor, services, ownerDocument);
  const pane = resolveSingleUsePane(services, knownPointer, ownerDocument);
  if (!pane) {
    return null;
  }
  const pointer = knownPointer ?? resolvePickElementCenterClientPointer(pane.pickElement);
  return {
    camera: pane.camera,
    pickElement: pane.pickElement,
    clientX: pointer.clientX,
    clientY: pointer.clientY,
  };
}

/**
 * Returns whether a live single-use sample may use the pinned pick element.
 * Client coordinates are window-local, so cross-document samples are ignored.
 *
 * @param editor Editor window owning last pointer state.
 * @param pinnedPickElement Pick element locked at single-use begin.
 * @returns True when the last pointer belongs to the pinned pick document.
 */
export function isSingleUsePointerCompatibleWithPinnedPick(
  editor: EditorWindow,
  pinnedPickElement: HTMLElement | null,
): boolean {
  if (!pinnedPickElement) {
    return false;
  }
  const ownerDocument = editor.lastPointerOwnerDocument;
  if (!ownerDocument) {
    return true;
  }
  return pinnedPickElement.ownerDocument === ownerDocument;
}

/**
 * Resolves the single-use pane from a known pointer, then document, then
 * active.
 *
 * @param services Map-editor services.
 * @param knownPointer Known client coordinates, or null.
 * @param ownerDocument Document that owns the pointer sample.
 * @returns Pane context, or null.
 */
function resolveSingleUsePane(
  services: EditorServices,
  knownPointer: { clientX: number; clientY: number } | null,
  ownerDocument: Document | null,
): EditorViewportPickContext | null {
  if (knownPointer) {
    const underPointer = services.resolveInteractiveViewportAtClientPoint(
      knownPointer.clientX,
      knownPointer.clientY,
      ownerDocument,
    );
    if (underPointer) {
      return underPointer;
    }
  }
  return services.resolveFirstInteractiveViewportInDocument(ownerDocument) ?? resolveActivePaneFallback(services);
}

/**
 * Falls back to the layout active pane when document-scoped resolution fails.
 *
 * @param services Map-editor services.
 * @returns Active pane context, or null.
 */
function resolveActivePaneFallback(services: EditorServices): EditorViewportPickContext | null {
  const camera = services.getActiveCamera();
  const pickElement = services.getActivePickElement();
  if (!camera || !pickElement) {
    return null;
  }
  return { camera, pickElement };
}

/**
 * Resolves a known client pointer from editor state or document input managers.
 *
 * @param editor Editor window owning last pointer state.
 * @param services Map-editor services.
 * @param ownerDocument Document that owns the pointer sample.
 * @returns Client coordinates, or null when none are known.
 */
function resolveKnownClientPointer(
  editor: EditorWindow,
  services: EditorServices,
  ownerDocument: Document | null,
): { clientX: number; clientY: number } | null {
  if (editor.hasLastPointerClient) {
    return {
      clientX: editor.lastPointerClientX,
      clientY: editor.lastPointerClientY,
    };
  }
  return services.getLastPointerClientPosition(ownerDocument);
}

/**
 * Uses the pick element center when no pointer sample exists yet.
 *
 * @param pickElement Pick element for NDC projection.
 * @returns Client coordinates at the element center.
 */
function resolvePickElementCenterClientPointer(pickElement: HTMLElement): {
  clientX: number;
  clientY: number;
} {
  const rect = pickElement.getBoundingClientRect();
  return {
    clientX: rect.left + rect.width * 0.5,
    clientY: rect.top + rect.height * 0.5,
  };
}
