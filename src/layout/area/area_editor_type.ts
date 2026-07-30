import type { ViewportKind } from '@/viewports/core/viewport_kind.js';

/**
 * Content kind hosted by a layout area. Extensible so future work can add
 * outliner, properties, and other non-viewport editors without redesigning the
 * tiling tree.
 */
export type AreaEditorType = 'viewport';

/** Payload stored on each leaf of the area layout tree. */
export interface AreaLeafPayload {
  /** Stable area identity across splits that keep this leaf. */
  areaId: string;
  /** Editor content type for this area. */
  editorType: AreaEditorType;
  /**
   * Viewport projection kind when {@link editorType} is `viewport`. Optional so
   * future non-viewport types omit it cleanly.
   */
  viewportKind?: ViewportKind;
}

/**
 * Creates a viewport area payload.
 *
 * @param areaId Stable area id.
 * @param viewportKind Projection kind for the pane.
 * @returns Leaf payload for a viewport area.
 */
export function createViewportLeafPayload(areaId: string, viewportKind: ViewportKind): AreaLeafPayload {
  return {
    areaId,
    editorType: 'viewport',
    viewportKind,
  };
}

/**
 * Returns whether a payload hosts a viewport editor.
 *
 * @param payload Leaf payload to inspect.
 * @returns True when the editor type is viewport.
 */
export function isViewportAreaPayload(payload: AreaLeafPayload): boolean {
  return payload.editorType === 'viewport';
}
