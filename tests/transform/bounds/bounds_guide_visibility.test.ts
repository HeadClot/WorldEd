import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  buildGuideRaycastWorldBoxes,
  doesGuideRayHitGroundPlane,
  doesGuideRayHitMeshes,
  findGuideRayGroundHitDistance,
  findGuideRayMeshHitDistance,
  findGuideRayPlanarHitDistance,
  isBoundsGuideAxisDrawnInView,
  rayHitDistanceOnPlaneAxes,
  resolveBoundsGuideRay,
  shouldShowBoundsGuideRay,
  transformGuideRayToWorld,
} from '../../../src/transform/bounds/bounds_guide_visibility.js';

describe('bounds_guide_visibility', () => {
  it('only allows the two in-plane axes in each 2D view', () => {
    expect(isBoundsGuideAxisDrawnInView('x', 'xz')).toBe(true);
    expect(isBoundsGuideAxisDrawnInView('y', 'xz')).toBe(false);
    expect(isBoundsGuideAxisDrawnInView('z', 'xz')).toBe(true);
    expect(isBoundsGuideAxisDrawnInView('x', 'xy')).toBe(true);
    expect(isBoundsGuideAxisDrawnInView('y', 'xy')).toBe(true);
    expect(isBoundsGuideAxisDrawnInView('z', 'xy')).toBe(false);
    expect(isBoundsGuideAxisDrawnInView('x', 'yz')).toBe(false);
    expect(isBoundsGuideAxisDrawnInView('y', 'yz')).toBe(true);
    expect(isBoundsGuideAxisDrawnInView('z', 'yz')).toBe(true);
    expect(isBoundsGuideAxisDrawnInView('y', 'xyz')).toBe(true);
  });

  it('detects rays that reach the ground plane within their length', () => {
    const origin = new THREE.Vector3(0, 2, 0);
    const down = new THREE.Vector3(0, -1, 0);
    expect(doesGuideRayHitGroundPlane(origin, down, 4)).toBe(true);
    expect(findGuideRayGroundHitDistance(origin, down, 4)).toBeCloseTo(2, 5);
    expect(doesGuideRayHitGroundPlane(origin, down, 1)).toBe(false);
    expect(doesGuideRayHitGroundPlane(origin, new THREE.Vector3(1, 0, 0), 10)).toBe(false);
  });

  it('detects rays that hit scene meshes and returns the hit distance', () => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 0.2), new THREE.MeshBasicMaterial());
    wall.position.set(0, 0, -2);
    wall.updateMatrixWorld(true);
    const origin = new THREE.Vector3(0, 0, 0);
    const forward = new THREE.Vector3(0, 0, -1);
    expect(doesGuideRayHitMeshes(origin, forward, 4, [wall])).toBe(true);
    expect(findGuideRayMeshHitDistance(origin, forward, 4, [wall])).toBeCloseTo(1.9, 1);
    expect(doesGuideRayHitMeshes(origin, forward, 0.5, [wall])).toBe(false);
  });

  it('prefers geometry draw length over an earlier ground plane hit in 3D', () => {
    const floorBlock = new THREE.Mesh(new THREE.BoxGeometry(2, 0.2, 2), new THREE.MeshBasicMaterial());
    floorBlock.position.set(0, -3, 0);
    floorBlock.updateMatrixWorld(true);
    const origin = new THREE.Vector3(0, 1, 0);
    const down = new THREE.Vector3(0, -1, 0);
    const resolution = resolveBoundsGuideRay({
      viewPlane: 'xyz',
      axis: 'y',
      worldOrigin: origin,
      worldDirection: down,
      length: 8,
      raycastMeshes: [floorBlock],
    });
    expect(resolution.show).toBe(true);
    expect(resolution.drawLength).toBeGreaterThan(3);
    expect(findGuideRayGroundHitDistance(origin, down, 8)).toBeCloseTo(1, 5);
  });

  it('clips to the ground when no geometry is hit in perspective', () => {
    const origin = new THREE.Vector3(0, 1, 0);
    const down = new THREE.Vector3(0, -1, 0);
    const resolution = resolveBoundsGuideRay({
      viewPlane: 'xyz',
      axis: 'y',
      worldOrigin: origin,
      worldDirection: down,
      length: 4,
      raycastMeshes: [],
    });
    expect(resolution.show).toBe(true);
    expect(resolution.drawLength).toBeCloseTo(1, 5);
  });

  it('uses planar hits in top view so different Y still counts as touching in XZ', () => {
    const highBrush = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    highBrush.position.set(3, 10, 0);
    highBrush.updateMatrixWorld(true);
    const boxes = buildGuideRaycastWorldBoxes([highBrush]);
    const origin = new THREE.Vector3(0, 0, 0);
    const alongX = new THREE.Vector3(1, 0, 0);
    const planarDistance = findGuideRayPlanarHitDistance(origin, alongX, 8, boxes, 'xz');
    expect(planarDistance).not.toBeNull();
    // Unit box at x=3 → half-extent 0.5, near face at x=2.5.
    expect(planarDistance!).toBeCloseTo(2.5, 5);
    const resolution = resolveBoundsGuideRay({
      viewPlane: 'xz',
      axis: 'x',
      worldOrigin: origin,
      worldDirection: alongX,
      length: 8,
      planarWorldBoxes: boxes,
    });
    expect(resolution.show).toBe(true);
    expect(resolution.drawLength).toBeCloseTo(2.5, 5);
  });

  it('sees a side-by-side cube in top view even when it is much higher on Y', () => {
    const low = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    low.position.set(0, 0, 0);
    low.updateMatrixWorld(true);
    const high = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    high.position.set(2, 8, 0);
    high.updateMatrixWorld(true);
    const boxes = buildGuideRaycastWorldBoxes([low]);
    // Ray from the left face of the high cube toward -X (toward the low cube).
    // Low box occupies x∈[-0.5,0.5]; origin at 1.5 → exact face distance 1.0.
    const origin = new THREE.Vector3(1.5, 8, 0.5);
    const left = new THREE.Vector3(-1, 0, 0);
    const distance = findGuideRayPlanarHitDistance(origin, left, 4, boxes, 'xz');
    expect(distance).not.toBeNull();
    expect(distance!).toBeCloseTo(1, 5);
  });

  it('ignores volumes that already contain the ray origin in the plane', () => {
    const spanning = new THREE.Box3(new THREE.Vector3(-2, -2, -2), new THREE.Vector3(4, 20, 2));
    const origin = new THREE.Vector3(1.5, 8, 0);
    const left = new THREE.Vector3(-1, 0, 0);
    expect(rayHitDistanceOnPlaneAxes(origin, left, 4, spanning, 0, 2, 0)).toBeNull();
  });

  it('never uses the ground plane for orthographic guide resolution', () => {
    const origin = new THREE.Vector3(0, 1, 0);
    const down = new THREE.Vector3(0, -1, 0);
    expect(
      shouldShowBoundsGuideRay({
        viewPlane: 'xy',
        axis: 'y',
        worldOrigin: origin,
        worldDirection: down,
        length: 4,
        planarWorldBoxes: [],
      }),
    ).toBe(false);
    expect(
      shouldShowBoundsGuideRay({
        viewPlane: 'xz',
        axis: 'y',
        worldOrigin: origin,
        worldDirection: down,
        length: 4,
        planarWorldBoxes: [],
      }),
    ).toBe(false);
  });

  it('intersects only on the two plane axes (top = X and Z, ignore Y)', () => {
    // Target is far away on Y but overlaps in XZ — top view must still hit.
    const box = new THREE.Box3(new THREE.Vector3(2, 50, -0.5), new THREE.Vector3(3, 51, 0.5));
    const origin = new THREE.Vector3(0, 0, 0);
    const alongX = new THREE.Vector3(1, 0, 0);
    const distance = rayHitDistanceOnPlaneAxes(origin, alongX, 8, box, 0, 2, 0);
    expect(distance).toBeCloseTo(2, 5);
    // If Y were tested, this ray at y=0 would miss y∈[50,51].
    const withY = rayHitDistanceOnPlaneAxes(origin, alongX, 8, box, 0, 1, 0);
    expect(withY).toBeNull();
  });

  it('transforms local guide rays into world space using bounds pose', () => {
    const center = new THREE.Vector3(10, 0, 0);
    const quaternion = new THREE.Quaternion();
    const world = transformGuideRayToWorld(new THREE.Vector3(1, 0, 0), new THREE.Vector3(5, 0, 0), center, quaternion);
    expect(world.origin.x).toBeCloseTo(11, 5);
    expect(world.length).toBeCloseTo(4, 5);
    expect(world.direction.x).toBeCloseTo(1, 5);
  });

  it('skips coplanar ground contact so horizontal guides can reach farther geometry', () => {
    // Brush sitting on Y=0: horizontal ray must not claim ground at distance 0.
    const origin = new THREE.Vector3(0, 0, 0);
    const alongX = new THREE.Vector3(1, 0, 0);
    expect(findGuideRayGroundHitDistance(origin, alongX, 4)).toBeNull();
    expect(
      shouldShowBoundsGuideRay({
        viewPlane: 'xyz',
        axis: 'x',
        worldOrigin: origin,
        worldDirection: alongX,
        length: 4,
        raycastMeshes: [],
      }),
    ).toBe(false);

    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2, 2), new THREE.MeshBasicMaterial());
    wall.position.set(3, 1, 0);
    wall.updateMatrixWorld(true);
    const resolution = resolveBoundsGuideRay({
      viewPlane: 'xyz',
      axis: 'x',
      worldOrigin: origin,
      worldDirection: alongX,
      length: 8,
      raycastMeshes: [wall],
    });
    expect(resolution.show).toBe(true);
    expect(resolution.drawLength).toBeGreaterThan(2);
    expect(resolution.drawLength).toBeLessThan(4);
  });

  it('skips contact mesh hits and uses the next solid along the ray in 3D', () => {
    // Large floor the origin sits on (coplanar top), plus a wall further along +X.
    const floor = new THREE.Mesh(new THREE.BoxGeometry(20, 0.2, 20), new THREE.MeshBasicMaterial());
    floor.position.set(0, -0.1, 0);
    floor.updateMatrixWorld(true);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2, 2), new THREE.MeshBasicMaterial());
    wall.position.set(4, 1, 0);
    wall.updateMatrixWorld(true);
    const origin = new THREE.Vector3(0, 0, 0);
    const alongX = new THREE.Vector3(1, 0, 0);
    const distance = findGuideRayMeshHitDistance(origin, alongX, 8, [floor, wall]);
    expect(distance).not.toBeNull();
    // Must reach the wall, not stop at floor contact (~0).
    expect(distance!).toBeGreaterThan(3);
    expect(distance!).toBeLessThan(4.2);
  });

  it('skips a containing floor in top view and draws to the next planar silhouette', () => {
    const floor = new THREE.Box3(new THREE.Vector3(-10, -1, -10), new THREE.Vector3(10, 0, 10));
    const wall = new THREE.Box3(new THREE.Vector3(3, 0, -1), new THREE.Vector3(3.2, 2, 1));
    const origin = new THREE.Vector3(0, 0.5, 0);
    const alongX = new THREE.Vector3(1, 0, 0);
    // Floor alone: origin is inside its XZ projection → no planar hit from that box.
    expect(rayHitDistanceOnPlaneAxes(origin, alongX, 8, floor, 0, 2, 0)).toBeNull();
    const distance = findGuideRayPlanarHitDistance(origin, alongX, 8, [floor, wall], 'xz');
    expect(distance).not.toBeNull();
    expect(distance!).toBeCloseTo(3, 5);
    const resolution = resolveBoundsGuideRay({
      viewPlane: 'xz',
      axis: 'x',
      worldOrigin: origin,
      worldDirection: alongX,
      length: 8,
      planarWorldBoxes: [floor, wall],
    });
    expect(resolution.show).toBe(true);
    expect(resolution.drawLength).toBeCloseTo(3, 5);
  });

  it('does not show a guide when the only hit is contact with no farther target', () => {
    const floor = new THREE.Mesh(new THREE.BoxGeometry(20, 0.2, 20), new THREE.MeshBasicMaterial());
    floor.position.set(0, -0.1, 0);
    floor.updateMatrixWorld(true);
    const origin = new THREE.Vector3(0, 0, 0);
    const alongX = new THREE.Vector3(1, 0, 0);
    expect(findGuideRayMeshHitDistance(origin, alongX, 4, [floor])).toBeNull();
    expect(
      shouldShowBoundsGuideRay({
        viewPlane: 'xyz',
        axis: 'x',
        worldOrigin: origin,
        worldDirection: alongX,
        length: 4,
        raycastMeshes: [floor],
      }),
    ).toBe(false);
  });
});
