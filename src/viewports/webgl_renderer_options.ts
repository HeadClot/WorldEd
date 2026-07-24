import * as THREE from 'three';
import { attachWebGLContextDiagnostics } from './webgl_context_diagnostics.js';

/**
 * Creates a canvas that reports WebGL failures before renderer construction.
 * @param ownerName Human-readable renderer owner used in diagnostics.
 * @returns Canvas prepared for Three.js WebGL rendering.
 */
export function createEditorWebGLCanvas(ownerName: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  attachWebGLContextDiagnostics(canvas, ownerName);
  return canvas;
}

/**
 * Returns conservative WebGL settings for desktop WebView backends.
 * @param alpha Whether the renderer needs a transparent drawing buffer.
 * @returns Three.js WebGL renderer parameters.
 */
export function getEditorWebGLRendererOptions(
  alpha = false
): THREE.WebGLRendererParameters {
  return {
    alpha,
    antialias: false,
    failIfMajorPerformanceCaveat: false,
    powerPreference: 'default',
  };
}
