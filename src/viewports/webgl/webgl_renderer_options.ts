import type * as THREE from 'three';
import { attachWebGLContextDiagnostics } from './webgl_context_diagnostics.js';

/**
 * Creates a canvas that reports WebGL failures before renderer construction.
 *
 * @param ownerName Human-readable renderer owner used in diagnostics.
 * @param ownerDocument Document that owns the canvas (main window or popup).
 * @returns Canvas prepared for Three.js WebGL rendering.
 */
export function createEditorWebGLCanvas(ownerName: string, ownerDocument: Document = document): HTMLCanvasElement {
  const canvas = ownerDocument.createElement('canvas');
  attachWebGLContextDiagnostics(canvas, ownerName);
  return canvas;
}

/** Options for editor WebGL renderer construction. */
export interface EditorWebGLRendererOptionOverrides {
  /** Transparent drawing buffer (overlay widgets). */
  alpha?: boolean;
  /**
   * Multisample antialiasing. Prefer false for the shared multi-view workspace:
   * MSAA softens 1-pixel grid/wireframe lines into a two-pixel blur. Overlay
   * widgets may still enable it.
   */
  antialias?: boolean;
}

/**
 * Returns WebGL settings for editor viewports and overlay widgets.
 *
 * @param alphaOrOverrides Transparency and/or antialias overrides. A boolean is
 *   treated as the legacy alpha flag (antialias defaults to true for widgets).
 * @returns Three.js WebGL renderer parameters.
 */
export function getEditorWebGLRendererOptions(
  alphaOrOverrides: boolean | EditorWebGLRendererOptionOverrides = false,
): THREE.WebGLRendererParameters {
  const overrides = typeof alphaOrOverrides === 'boolean' ? { alpha: alphaOrOverrides } : alphaOrOverrides;
  return {
    alpha: overrides.alpha ?? false,
    antialias: overrides.antialias ?? true,
    failIfMajorPerformanceCaveat: false,
    powerPreference: 'default',
  };
}
