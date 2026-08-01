import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { freeScaleAxisFactors } from '@/transform/core/free_scale_axis_factors.js';

describe('freeScaleAxisFactors', () => {
  it('returns uniform XYZ for single-use free scale', () => {
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    camera.position.set(0, 10, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const factors = freeScaleAxisFactors(2, camera, true);
    expect(factors.x).toBe(2);
    expect(factors.y).toBe(2);
    expect(factors.z).toBe(2);
  });

  it('returns uniform XYZ for perspective free scale', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(5, 5, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const factors = freeScaleAxisFactors(1.5, camera, false);
    expect(factors.x).toBe(1.5);
    expect(factors.y).toBe(1.5);
    expect(factors.z).toBe(1.5);
  });

  it('keeps top-view depth (Y) unscaled for orthographic free scale', () => {
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    camera.position.set(0, 20, 0);
    camera.up.set(0, 0, -1);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const factors = freeScaleAxisFactors(3, camera, false);
    expect(factors.x).toBe(3);
    expect(factors.y).toBe(1);
    expect(factors.z).toBe(3);
  });

  it('keeps front-view depth (Z) unscaled for orthographic free scale', () => {
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    camera.position.set(0, 0, 20);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const factors = freeScaleAxisFactors(2, camera, false);
    expect(factors.x).toBe(2);
    expect(factors.y).toBe(2);
    expect(factors.z).toBe(1);
  });
});
