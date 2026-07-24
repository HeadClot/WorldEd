import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  computeBrushSpawnPosition,
  snapPositionToGrid,
} from '../../src/solid/model/brush_spawn_placement.js';

/**
 * Unit tests for camera-front, grid-aligned brush spawn placement.
 */
describe('brush_spawn_placement', () => {
  it('places a brush ahead of the camera along the view forward', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(10, 4, 20);
    camera.lookAt(10, 4, 0);
    camera.updateMatrixWorld(true);
    const position = computeBrushSpawnPosition(camera, 8);
    snapPositionToGrid(position, 1);
    expect(position.z).toBeLessThan(camera.position.z);
    expect(position.x).toBeCloseTo(10, 5);
  });

  it('snaps each axis to the grid interval', () => {
    const position = new THREE.Vector3(1.4, -2.6, 3.1);
    snapPositionToGrid(position, 1);
    expect(position.x).toBe(1);
    expect(position.y).toBe(-3);
    expect(position.z).toBe(3);
  });

  it('does not cascade with brush-count diagonal offsets', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const first = computeBrushSpawnPosition(camera, 8);
    const second = computeBrushSpawnPosition(camera, 8);
    expect(first.x).toBeCloseTo(second.x, 5);
    expect(first.y).toBeCloseTo(second.y, 5);
    expect(first.z).toBeCloseTo(second.z, 5);
    expect(Math.abs(first.x)).toBeLessThan(0.01);
    expect(first.z).toBeCloseTo(2, 5);
  });
});
