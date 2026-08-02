import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

/**
 * Documents the Three.js viewport + pixelRatio trap that caused capture images
 * to squash subjects into a corner of the frame.
 *
 * Three.js WebGLRenderer.setViewport always multiplies by canvas pixelRatio.
 * Render targets use 1:1 pixel viewports via renderTarget.viewport when
 * setRenderTarget is called. Calling setViewport(0,0,rtSize,rtSize) after
 * setRenderTarget expands the GL viewport to rtSize*pixelRatio and only a
 * corner of the projected view is written into the RT texture.
 */
describe('capture render target viewport (pixel ratio trap)', () => {
  it('WebGLRenderTarget viewport is 1:1 with texture pixels', () => {
    const resolution = 256;
    const renderTarget = new THREE.WebGLRenderTarget(resolution, resolution);
    expect(renderTarget.width).toBe(resolution);
    expect(renderTarget.height).toBe(resolution);
    expect(renderTarget.viewport.z).toBe(resolution);
    expect(renderTarget.viewport.w).toBe(resolution);
    renderTarget.viewport.set(0, 0, resolution, resolution);
    expect(renderTarget.viewport.x).toBe(0);
    expect(renderTarget.viewport.y).toBe(0);
    renderTarget.dispose();
  });

  it('documents that canvas pixel ratio would expand a logical viewport', () => {
    const logicalCaptureSize = 256;
    const editorPixelRatio = 1.5;
    const mistakenGlViewport = Math.round(logicalCaptureSize * editorPixelRatio);
    expect(mistakenGlViewport).toBe(384);
    expect(mistakenGlViewport).toBeGreaterThan(logicalCaptureSize);
  });
});
