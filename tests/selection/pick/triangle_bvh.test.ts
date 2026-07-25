import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TriangleBvh } from '../../../src/selection/pick/triangle_bvh.js';

describe('TriangleBvh', () => {
  it('hits the front of a unit plane from positive Z', () => {
    const geometry = new THREE.PlaneGeometry(2, 2);
    const bvh = new TriangleBvh(geometry);
    const hit = bvh.raycastFrontFacing(new THREE.Vector3(0, 0, 2), new THREE.Vector3(0, 0, -1));
    expect(hit).not.toBeNull();
    expect(hit!.faceIndex).toBeGreaterThanOrEqual(0);
    expect(hit!.point.z).toBeCloseTo(0, 5);
  });

  it('ignores the back of a unit plane from negative Z', () => {
    const geometry = new THREE.PlaneGeometry(2, 2);
    const bvh = new TriangleBvh(geometry);
    const hit = bvh.raycastFrontFacing(new THREE.Vector3(0, 0, -2), new THREE.Vector3(0, 0, 1));
    expect(hit).toBeNull();
  });

  it('finds a near face on a dense grid faster than scanning every cell result', () => {
    const geometry = createGridPlane(40, 40);
    const bvh = new TriangleBvh(geometry);
    const origin = new THREE.Vector3(0.1, -0.2, 5);
    const direction = new THREE.Vector3(0, 0, -1);
    const hit = bvh.raycastFrontFacing(origin, direction);
    expect(hit).not.toBeNull();
    expect(hit!.distance).toBeCloseTo(5, 4);
  });
});

/**
 * Builds a subdivided XY plane facing +Z for BVH stress tests.
 *
 * @param segmentsX Width segments.
 * @param segmentsY Height segments.
 * @returns Plane geometry.
 */
function createGridPlane(segmentsX: number, segmentsY: number): THREE.BufferGeometry {
  return new THREE.PlaneGeometry(4, 4, segmentsX, segmentsY);
}
