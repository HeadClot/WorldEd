import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  createCadPlacementContext,
  createFixedCadPlacementContext,
  estimateWorldUnitsPerPixel,
  writeDirectionTowardCamera,
} from '../../src/rulers/cad_placement_context.js';

describe('cad_placement_context', () => {
  it('should estimate larger world units per pixel when ortho zoom is smaller', () => {
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    camera.zoom = 1;
    const coarse = estimateWorldUnitsPerPixel(camera, 200, new THREE.Vector3());
    camera.zoom = 4;
    const fine = estimateWorldUnitsPerPixel(camera, 200, new THREE.Vector3());
    expect(coarse).toBeGreaterThan(fine);
  });

  it('should keep dimension stand-off small and clamped', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 5);
    const placement = createCadPlacementContext(camera, 600, new THREE.Vector3());
    expect(placement.offsetWorld).toBeGreaterThan(0);
    expect(placement.offsetWorld).toBeLessThan(3);
    expect(placement.gapWorld).toBe(0);
    expect(placement.overshootWorld).toBe(0);
  });

  it('should use smaller world stand-off for taller viewport CSS height', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 5);
    const shortPane = createCadPlacementContext(camera, 200, new THREE.Vector3());
    const tallPane = createCadPlacementContext(camera, 800, new THREE.Vector3());
    expect(shortPane.offsetWorld).toBeGreaterThan(tallPane.offsetWorld);
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

  it('should create a fixed context with zero gap and zero overshoot', () => {
    const camera = new THREE.PerspectiveCamera();
    const placement = createFixedCadPlacementContext(camera, 0.2);
    expect(placement.offsetWorld).toBeCloseTo(0.2, 5);
    expect(placement.gapWorld).toBe(0);
    expect(placement.overshootWorld).toBe(0);
  });
});
