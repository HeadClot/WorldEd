import type { EditorViewport } from './editor_viewport.js';
import { isPerspectiveViewport } from './editor_viewport.js';

/**
 * Fully disposes a live editor viewport and frees WebGL resources.
 *
 * @param viewport Viewport instance to tear down.
 */
export function disposeEditorViewport(viewport: EditorViewport): void {
  viewport.dispose();
}

/**
 * Disposes every viewport in a list.
 *
 * @param viewports Viewports to dispose.
 */
export function disposeEditorViewports(viewports: readonly EditorViewport[]): void {
  viewports.forEach((viewport) => disposeEditorViewport(viewport));
}

/**
 * Returns whether the viewport is a perspective instance (for dispose paths
 * that need type-specific cleanup beyond the shared dispose method).
 *
 * @param viewport Viewport under inspection.
 * @returns True for Viewport3D.
 */
export function viewportRequiresFlyingCameraDispose(viewport: EditorViewport): boolean {
  return isPerspectiveViewport(viewport);
}
