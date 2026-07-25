import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  createCadPlacementContext,
  createFixedCadPlacementContext,
  estimateWorldUnitsPerPixel,
  writeDirectionTowardCamera,
} from '../../src/rulers/cad_placement_context.js';

/**
 * Builds a mock renderer with fixed canvas CSS size.
 *
 * @param width CSS width.
 * @param height CSS height.
 * @returns Renderer stub.
 */
function mockRenderer(width: number, height: number): THREE.WebGLRenderer {
  const canvas = document.createElement('canvas');
  Object.defineProperty(canvas, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(canvas, 'clientHeight', { value: height, configurable: true });
  return { domElement: canvas } as unknown as THREE.WebGLRenderer;
}

describe('cad_placement_context', () => {
  it('should estimate larger world units per pixel when ortho zoom is smaller', () => {
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    camera.zoom = 1;
    const renderer = mockRenderer(200, 200);
    const coarse = estimateWorldUnitsPerPixel(camera, renderer, new THREE.Vector3());
    camera.zoom = 4;
    const fine = estimateWorldUnitsPerPixel(camera, renderer, new THREE.Vector3());
    expect(coarse).toBeGreaterThan(fine);
  });

  it('should keep dimension stand-off small and clamped', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 5);
    const placement = createCadPlacementContext(camera, mockRenderer(800, 600), new THREE.Vector3());
    expect(placement.offsetWorld).toBeGreaterThan(0);
    expect(placement.offsetWorld).toBeLessThan(3);
    expect(placement.gapWorld).toBe(0);
  });

  it('should write orthographic to-camera as opposite look direction', () => {
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    camera.position.set(0, 10, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const toCamera = new THREE.Vector3();
    writeDirectionTowardCamera(camera, new THREE.Vector3(0, 0, 0), toCamera);
    expect(toCamera.y).toBeGreaterThan(0.9);
  });

  it('should create a fixed context with zero gap for connected extensions', () => {
    const camera = new THREE.PerspectiveCamera();
    const placement = createFixedCadPlacementContext(camera, 0.2);
    expect(placement.offsetWorld).toBeCloseTo(0.2, 5);
    expect(placement.gapWorld).toBe(0);
  });
});
