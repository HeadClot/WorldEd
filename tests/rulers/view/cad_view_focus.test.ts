import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  intersectOrientedBoundsRay,
  isPointInsideOrientedBounds,
  writeCameraViewFocusOnBounds,
} from '@/rulers/view/cad_view_focus.js';
import type { DataOrientedBounds } from '@/transform/bounds/builder_oriented_bounds.js';

/**
 * Builds axis-aligned bounds at the origin.
 *
 * @param half Half extents.
 * @returns Oriented bounds data.
 */
function makeBounds(half: number): DataOrientedBounds {
  return {
    center: new THREE.Vector3(0, half, 0),
    quaternion: new THREE.Quaternion(),
    halfExtents: new THREE.Vector3(half, half, half),
  };
}

/**
 * Creates a camera at eye looking at a target.
 *
 * @param eye Camera position.
 * @param target Look-at point.
 * @returns Configured perspective camera.
 */
function makeCamera(eye: THREE.Vector3, target: THREE.Vector3): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.copy(eye);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  return camera;
}

describe('cad_view_focus', () => {
  it('should hit the front face when looking horizontally at the cube', () => {
    const bounds = makeBounds(0.5);
    const hit = new THREE.Vector3();
    const origin = new THREE.Vector3(0, 0.5, 5);
    const direction = new THREE.Vector3(0, 0, -1);
    expect(intersectOrientedBoundsRay(origin, direction, bounds, hit, false)).toBe(true);
    expect(hit.z).toBeCloseTo(0.5, 4);
    expect(hit.y).toBeCloseTo(0.5, 4);
  });

  it('should hit higher on the front face when looking up at the top edge', () => {
    const bounds = makeBounds(0.5);
    const eye = new THREE.Vector3(0, 0, 4);
    const topEdge = new THREE.Vector3(0, 1, 0.5);
    const camera = makeCamera(eye, topEdge);
    const focus = new THREE.Vector3();
    writeCameraViewFocusOnBounds(camera, bounds, focus);
    expect(focus.y).toBeGreaterThan(0.55);
    expect(focus.z).toBeGreaterThan(0.2);
  });

  it('should prefer the bottom when looking down at the lower edge from above-front', () => {
    const bounds = makeBounds(0.5);
    const eye = new THREE.Vector3(0, 2, 3);
    const bottomFront = new THREE.Vector3(0, 0, 0.5);
    const camera = makeCamera(eye, bottomFront);
    const focus = new THREE.Vector3();
    writeCameraViewFocusOnBounds(camera, bounds, focus);
    expect(focus.y).toBeLessThan(0.45);
  });

  it('should use the far wall when the camera is inside the bounds', () => {
    const bounds = makeBounds(1);
    // Camera at center looking +Z — near hit would be at eye; far hit is +Z face.
    const origin = new THREE.Vector3(0, 1, 0);
    const direction = new THREE.Vector3(0, 0, 1);
    expect(isPointInsideOrientedBounds(origin, bounds)).toBe(true);
    const hit = new THREE.Vector3();
    expect(intersectOrientedBoundsRay(origin, direction, bounds, hit, true)).toBe(true);
    expect(hit.z).toBeCloseTo(1, 4);
  });

  it('should look at the far face when writing focus from inside', () => {
    const bounds = makeBounds(1);
    const camera = makeCamera(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 2));
    const focus = new THREE.Vector3();
    writeCameraViewFocusOnBounds(camera, bounds, focus);
    expect(focus.z).toBeCloseTo(1, 3);
  });
});
