import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { isIntersectionFrontFacing } from '../../src/selection/raycast_front_face.js';

describe('isIntersectionFrontFacing', () => {
  it('accepts a triangle whose normal faces the camera ray', () => {
    const mesh = createUnitPlaneMesh();
    const hit = createHitWithLocalNormal(mesh, new THREE.Vector3(0, 0, 1));
    const rayTowardPlane = new THREE.Vector3(0, 0, -1);
    expect(isIntersectionFrontFacing(hit, rayTowardPlane)).toBe(true);
  });

  it('rejects a triangle whose normal faces away from the camera ray', () => {
    const mesh = createUnitPlaneMesh();
    const hit = createHitWithLocalNormal(mesh, new THREE.Vector3(0, 0, 1));
    const rayFromBehind = new THREE.Vector3(0, 0, 1);
    expect(isIntersectionFrontFacing(hit, rayFromBehind)).toBe(false);
  });

  it('uses world-space normals when the mesh is rotated', () => {
    const mesh = createUnitPlaneMesh();
    mesh.rotation.y = Math.PI;
    mesh.updateMatrixWorld(true);
    const hit = createHitWithLocalNormal(mesh, new THREE.Vector3(0, 0, 1));
    const rayTowardRotatedFront = new THREE.Vector3(0, 0, 1);
    expect(isIntersectionFrontFacing(hit, rayTowardRotatedFront)).toBe(true);
  });

  it('returns false when the intersection has no face data', () => {
    const mesh = createUnitPlaneMesh();
    const hit = {
      object: mesh,
      distance: 1,
      point: new THREE.Vector3(),
      face: null,
      faceIndex: 0,
    } as THREE.Intersection;
    expect(isIntersectionFrontFacing(hit, new THREE.Vector3(0, 0, -1))).toBe(false);
  });
});

/**
 * Creates a plane mesh with an identity world matrix.
 *
 * @returns Mesh for front-face tests.
 */
function createUnitPlaneMesh(): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
  mesh.updateMatrixWorld(true);
  return mesh;
}

/**
 * Builds a minimal intersection with a given local face normal.
 *
 * @param mesh Host mesh for the hit.
 * @param localNormal Local-space triangle normal.
 * @returns Intersection-like object for the helper under test.
 */
function createHitWithLocalNormal(mesh: THREE.Mesh, localNormal: THREE.Vector3): THREE.Intersection {
  return {
    object: mesh,
    distance: 1,
    point: new THREE.Vector3(),
    face: {
      a: 0,
      b: 1,
      c: 2,
      normal: localNormal.clone(),
      materialIndex: 0,
    },
    faceIndex: 0,
  } as THREE.Intersection;
}
