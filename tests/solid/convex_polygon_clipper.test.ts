import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ConvexPolygonClipper } from '@/solid/algorithm/surface/convex_polygon_clipper.js';
import { HashedVertexTable } from '@/solid/algorithm/spatial/hashed_vertex_table.js';
import { SOLID_FAT_PLANE_EPSILON } from '@/solid/algorithm/math/solid_math_constants.js';
import { SolidPlane } from '@/solid/brush/solid_plane.js';

/**
 * Builds a unit square in the XY plane centered at the origin.
 *
 * @returns Convex square polygon.
 */
function unitSquare(): THREE.Vector3[] {
  return [
    new THREE.Vector3(-1, -1, 0),
    new THREE.Vector3(1, -1, 0),
    new THREE.Vector3(1, 1, 0),
    new THREE.Vector3(-1, 1, 0),
  ];
}

/** Unit tests for convex polygon plane clipping used by solid CSG. */
describe('ConvexPolygonClipper', () => {
  it('clips a unit square by a mid plane keeping both halves', () => {
    const plane = new SolidPlane(new THREE.Vector3(1, 0, 0), 0);
    const result = ConvexPolygonClipper.clipByPlane(unitSquare(), plane);
    expect(result.inside.length).toBeGreaterThanOrEqual(3);
    expect(result.outside.length).toBeGreaterThanOrEqual(3);
    for (const point of result.inside) {
      expect(point.x).toBeLessThanOrEqual(1e-5);
    }
    for (const point of result.outside) {
      expect(point.x).toBeGreaterThanOrEqual(-1e-5);
    }
  });

  it('clips a polygon fully inside all planes of a box', () => {
    const square = [
      new THREE.Vector3(-0.5, -0.5, 0),
      new THREE.Vector3(0.5, -0.5, 0),
      new THREE.Vector3(0.5, 0.5, 0),
      new THREE.Vector3(-0.5, 0.5, 0),
    ];
    const planes = [
      new SolidPlane(new THREE.Vector3(1, 0, 0), -1),
      new SolidPlane(new THREE.Vector3(-1, 0, 0), -1),
      new SolidPlane(new THREE.Vector3(0, 1, 0), -1),
      new SolidPlane(new THREE.Vector3(0, -1, 0), -1),
    ];
    const clipped = ConvexPolygonClipper.clipInsideAllPlanes(square, planes);
    expect(clipped.length).toBe(4);
  });

  it('welds clip intersections through a shared vertex table', () => {
    const table = new HashedVertexTable();
    const plane = new SolidPlane(new THREE.Vector3(1, 0, 0), 0);
    const first = ConvexPolygonClipper.clipByPlane(unitSquare(), plane, SOLID_FAT_PLANE_EPSILON, table);
    const second = ConvexPolygonClipper.clipByPlane(unitSquare(), plane, SOLID_FAT_PLANE_EPSILON, table);
    const firstCut = first.inside.filter((point) => Math.abs(point.x) < 1e-9);
    const secondCut = second.inside.filter((point) => Math.abs(point.x) < 1e-9);
    expect(firstCut.length).toBeGreaterThanOrEqual(2);
    expect(secondCut.length).toBeGreaterThanOrEqual(2);
    for (const point of secondCut) {
      const match = firstCut.some((candidate) => candidate.distanceToSquared(point) === 0);
      expect(match).toBe(true);
    }
  });
});
