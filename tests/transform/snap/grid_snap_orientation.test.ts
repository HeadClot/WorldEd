import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import {
  buildEdgeAlignedOrientation,
  buildDefaultWorldBasis,
} from '@/navigation/orientation/editor_orientation_edge_align.js';

describe('GridSnap orientation-aware translation', () => {
  it('snaps free deltas along a rotated working Z axis instead of world XYZ', () => {
    const snap = new GridSnap(true, 1);
    const edge = new THREE.Vector3(1, 0, 1).normalize();
    const outcome = buildEdgeAlignedOrientation('z', edge, buildDefaultWorldBasis(), edge, new THREE.Vector3());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    snap.setPlaneFrame(outcome.planeFrame);
    const delta = edge.clone().multiplyScalar(1.4);
    snap.snapVector3(delta);
    expect(delta.length()).toBeCloseTo(1, 5);
    expect(delta.clone().normalize().dot(edge)).toBeCloseTo(1, 5);
    expect(Math.abs(delta.x - delta.z)).toBeLessThan(1e-6);
  });

  it('snaps world positions onto the rotated lattice through the plane origin', () => {
    const snap = new GridSnap(true, 1);
    const origin = new THREE.Vector3(10, 0, 10);
    const edge = new THREE.Vector3(1, 0, 0);
    const outcome = buildEdgeAlignedOrientation('z', edge, buildDefaultWorldBasis(), edge, origin);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    snap.setPlaneFrame(outcome.planeFrame);
    const position = origin.clone().add(new THREE.Vector3(0, 0, 1.4));
    snap.snapWorldPosition(position);
    expect(position.distanceTo(origin.clone().add(new THREE.Vector3(0, 0, 1)))).toBeLessThan(1e-5);
  });

  it('only snaps changed local axes relative to start', () => {
    const snap = new GridSnap(true, 1);
    const edge = new THREE.Vector3(1, 0, 1).normalize();
    const outcome = buildEdgeAlignedOrientation('z', edge, buildDefaultWorldBasis(), edge, new THREE.Vector3());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    snap.setPlaneFrame(outcome.planeFrame);
    const start = edge.clone().multiplyScalar(0.3);
    const current = edge.clone().multiplyScalar(1.4);
    snap.snapChangedAxes(current, start);
    expect(current.length()).toBeCloseTo(1, 5);
    expect(current.clone().normalize().dot(edge)).toBeCloseTo(1, 5);
  });

  it('keeps default world XYZ behavior when the plane frame is identity', () => {
    const snap = new GridSnap(true, 1);
    const vector = new THREE.Vector3(0.4, 1.7, -0.3);
    snap.snapVector3(vector);
    expect(vector.x).toBeCloseTo(0);
    expect(vector.y).toBeCloseTo(2);
    expect(vector.z).toBeCloseTo(0);
  });
});
