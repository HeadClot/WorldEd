import type { ViewportEditor } from './viewport_editor.js';

/**
 * Fully disposes a live editor viewport and frees WebGL resources.
 *
 * @param viewport Viewport instance to tear down.
 */
export function disposeEditorViewport(viewport: ViewportEditor): void {
  viewport.dispose();
}
