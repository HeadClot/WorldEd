import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  SOLID_FAT_PLANE_EPSILON,
  SOLID_PLANE_CUT_EPSILON,
  SOLID_VERTEX_EQUAL_EPSILON,
} from '@/solid/algorithm/math/solid_math_constants.js';
import { HashedVertexTable } from '@/solid/algorithm/spatial/hashed_vertex_table.js';
import { SurfaceFragmentSplitter } from '@/solid/algorithm/surface/surface_fragment_splitter.js';
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

/** SurfaceFragmentSplitter cut detection and plane arrangement. */
describe('SurfaceFragmentSplitter', () => {
  it('detects cuts inside the fat membership band via the tight cut epsilon', () => {
    const halfFat = SOLID_FAT_PLANE_EPSILON * 0.5;
    expect(halfFat).toBeGreaterThan(SOLID_PLANE_CUT_EPSILON);
    const polygon = [
      new THREE.Vector3(-halfFat, 0, 0),
      new THREE.Vector3(halfFat, 0, 0),
      new THREE.Vector3(halfFat, 1, 0),
      new THREE.Vector3(-halfFat, 1, 0),
    ];
    const plane = new SolidPlane(new THREE.Vector3(1, 0, 0), 0);
    expect(SurfaceFragmentSplitter.planeLikelyCutsPolygon(polygon, plane)).toBe(true);
    expect(SurfaceFragmentSplitter.planeLikelyCutsPolygon(polygon, plane, SOLID_FAT_PLANE_EPSILON)).toBe(false);
  });

  it('rejects planes when all vertices lie on one side of the cut epsilon', () => {
    const polygon = unitSquare();
    const plane = new SolidPlane(new THREE.Vector3(1, 0, 0), -2);
    expect(SurfaceFragmentSplitter.planeLikelyCutsPolygon(polygon, plane)).toBe(false);
  });

  it('splits a square by a mid plane into two fragments', () => {
    const fragments = SurfaceFragmentSplitter.splitByPlanes(unitSquare(), [
      new SolidPlane(new THREE.Vector3(1, 0, 0), 0),
    ]);
    expect(fragments.length).toBe(2);
    for (const fragment of fragments) {
      expect(fragment.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('detects fat-band straddles that the fat membership epsilon would miss', () => {
    const shallowInside = SOLID_FAT_PLANE_EPSILON * 0.5;
    const deepOutside = SOLID_FAT_PLANE_EPSILON * 1.5;
    expect(shallowInside).toBeGreaterThan(SOLID_PLANE_CUT_EPSILON);
    expect(deepOutside).toBeGreaterThan(SOLID_FAT_PLANE_EPSILON);
    const polygon = [
      new THREE.Vector3(-shallowInside, -1, 0),
      new THREE.Vector3(deepOutside, -1, 0),
      new THREE.Vector3(deepOutside, 1, 0),
      new THREE.Vector3(-shallowInside, 1, 0),
    ];
    const plane = new SolidPlane(new THREE.Vector3(1, 0, 0), 0);
    expect(SurfaceFragmentSplitter.planeLikelyCutsPolygon(polygon, plane)).toBe(true);
    expect(SurfaceFragmentSplitter.planeLikelyCutsPolygon(polygon, plane, SOLID_FAT_PLANE_EPSILON)).toBe(false);
  });

  it('keeps both halves when the straddle is wider than the Chisel weld epsilon', () => {
    const halfExtent = SOLID_VERTEX_EQUAL_EPSILON * 2;
    const polygon = [
      new THREE.Vector3(-halfExtent, -1, 0),
      new THREE.Vector3(halfExtent, -1, 0),
      new THREE.Vector3(halfExtent, 1, 0),
      new THREE.Vector3(-halfExtent, 1, 0),
    ];
    const plane = new SolidPlane(new THREE.Vector3(1, 0, 0), 0);
    const fragments = SurfaceFragmentSplitter.splitByPlanes(polygon, [plane]);
    expect(fragments.length).toBe(2);
  });

  it('shares welded cut vertices across orthogonal plane cuts on one face', () => {
    const table = new HashedVertexTable();
    const planes = [new SolidPlane(new THREE.Vector3(1, 0, 0), 0), new SolidPlane(new THREE.Vector3(0, 1, 0), 0)];
    const fragments = SurfaceFragmentSplitter.splitByPlanes(unitSquare(), planes, table);
    expect(fragments.length).toBe(4);
    const originHits = fragments.flat().filter((point) => point.distanceTo(new THREE.Vector3(0, 0, 0)) === 0);
    expect(originHits.length).toBeGreaterThanOrEqual(4);
    expect(table.count).toBeLessThan(unitSquare().length + 8);
  });

  it('welds slightly jittered endpoints that fall within Chisel vertex epsilon', () => {
    const table = new HashedVertexTable();
    const jitter = SOLID_VERTEX_EQUAL_EPSILON * 0.4;
    const a = table.snap(new THREE.Vector3(0, 0, 0));
    const b = table.snap(new THREE.Vector3(jitter, 0, 0));
    expect(a.distanceTo(b)).toBe(0);
    expect(table.count).toBe(1);
  });
});
