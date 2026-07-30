import type { ViewportEditor } from './viewport_editor.js';
import { isPerspectiveViewport } from './viewport_editor.js';

/**
 * Fully disposes a live editor viewport and frees WebGL resources.
 *
 * @param viewport Viewport instance to tear down.
 */
export function disposeEditorViewport(viewport: ViewportEditor): void {
  viewport.dispose();
}

/**
 * Disposes every viewport in a list.
 *
 * @param viewports Viewports to dispose.
 */
export function disposeEditorViewports(viewports: readonly ViewportEditor[]): void {
  viewports.forEach((viewport) => disposeEditorViewport(viewport));
}

/**
 * Returns whether the viewport is a perspective instance (for dispose paths
 * that need type-specific cleanup beyond the shared dispose method).
 *
 * @param viewport Viewport under inspection.
 * @returns True for Viewport3D.
 */
export function viewportRequiresFlyingCameraDispose(viewport: ViewportEditor): boolean {
  return isPerspectiveViewport(viewport);
}
