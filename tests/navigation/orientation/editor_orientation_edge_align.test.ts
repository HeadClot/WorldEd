import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  buildDefaultWorldBasis,
  buildEdgeAlignedOrientation,
  worldBasisFromQuaternion,
} from '@/navigation/orientation/editor_orientation_edge_align.js';
import { EDITOR_DEFAULT_UP } from '@/navigation/orientation/editor_orientation_basis.js';

/**
 * Asserts a right-handed orthonormal basis.
 *
 * @param basis World basis under test.
 */
function expectOrthonormalRightHanded(basis: {
  xAxis: THREE.Vector3;
  yAxis: THREE.Vector3;
  zAxis: THREE.Vector3;
}): void {
  expect(basis.xAxis.length()).toBeCloseTo(1, 6);
  expect(basis.yAxis.length()).toBeCloseTo(1, 6);
  expect(basis.zAxis.length()).toBeCloseTo(1, 6);
  expect(Math.abs(basis.xAxis.dot(basis.yAxis))).toBeLessThan(1e-6);
  expect(Math.abs(basis.yAxis.dot(basis.zAxis))).toBeLessThan(1e-6);
  expect(Math.abs(basis.zAxis.dot(basis.xAxis))).toBeLessThan(1e-6);
  const cross = new THREE.Vector3().crossVectors(basis.xAxis, basis.yAxis);
  expect(cross.dot(basis.zAxis)).toBeCloseTo(1, 5);
}

describe('editor_orientation_edge_align', () => {
  it('aligns Z to a horizontal tunnel turn while preserving Y-up', () => {
    const current = buildDefaultWorldBasis();
    const edge = new THREE.Vector3(Math.cos((-15 * Math.PI) / 180), 0, Math.sin((-15 * Math.PI) / 180));
    const cameraLook = edge.clone();
    const origin = new THREE.Vector3(1, 2, 3);
    const outcome = buildEdgeAlignedOrientation('z', edge, current, cameraLook, origin);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expectOrthonormalRightHanded(outcome.basis);
    expect(outcome.basis.zAxis.dot(edge.clone().normalize())).toBeCloseTo(1, 5);
    expect(outcome.basis.yAxis.distanceTo(EDITOR_DEFAULT_UP)).toBeLessThan(1e-5);
    expect(outcome.planeFrame.origin.distanceTo(origin)).toBeLessThan(1e-8);
    expect(outcome.planeFrame.normal.distanceTo(outcome.basis.yAxis)).toBeLessThan(1e-6);
    expect(outcome.planeFrame.uAxis.distanceTo(outcome.basis.xAxis)).toBeLessThan(1e-6);
    expect(outcome.planeFrame.vAxis.distanceTo(outcome.basis.zAxis)).toBeLessThan(1e-6);
  });

  it('chooses edge sign from camera look direction', () => {
    const current = buildDefaultWorldBasis();
    const edge = new THREE.Vector3(0, 0, 1);
    const lookAgainst = new THREE.Vector3(0, 0, -1);
    const outcome = buildEdgeAlignedOrientation('z', edge, current, lookAgainst, new THREE.Vector3());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.basis.zAxis.z).toBeLessThan(0);
  });

  it('aligns Y while preserving Z and rebuilding X', () => {
    const current = buildDefaultWorldBasis();
    const tiltedUp = new THREE.Vector3(0.2, 1, 0).normalize();
    const cameraLook = new THREE.Vector3(0, 0, -1);
    const outcome = buildEdgeAlignedOrientation('y', tiltedUp, current, cameraLook, new THREE.Vector3());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expectOrthonormalRightHanded(outcome.basis);
    expect(outcome.basis.yAxis.dot(tiltedUp)).toBeCloseTo(1, 5);
    expect(Math.abs(outcome.basis.zAxis.dot(current.zAxis))).toBeGreaterThan(0.9);
  });

  it('aligns X while preserving Y', () => {
    const current = buildDefaultWorldBasis();
    const diagonal = new THREE.Vector3(1, 0, 1).normalize();
    const cameraLook = diagonal.clone();
    const outcome = buildEdgeAlignedOrientation('x', diagonal, current, cameraLook, new THREE.Vector3());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expectOrthonormalRightHanded(outcome.basis);
    expect(outcome.basis.xAxis.dot(diagonal)).toBeCloseTo(1, 5);
    expect(outcome.basis.yAxis.distanceTo(EDITOR_DEFAULT_UP)).toBeLessThan(1e-5);
  });

  it('rejects a zero-length edge', () => {
    const outcome = buildEdgeAlignedOrientation(
      'z',
      new THREE.Vector3(0, 0, 0),
      buildDefaultWorldBasis(),
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(),
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.reason).toBe('degenerate_edge');
  });

  it('accepts a vertical edge for Align Z by falling back off preserved Y', () => {
    const outcome = buildEdgeAlignedOrientation(
      'z',
      new THREE.Vector3(0, 1, 0),
      buildDefaultWorldBasis(),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expectOrthonormalRightHanded(outcome.basis);
    expect(Math.abs(outcome.basis.zAxis.dot(new THREE.Vector3(0, 1, 0)))).toBeCloseTo(1, 5);
    expect(Math.abs(outcome.basis.yAxis.dot(outcome.basis.zAxis))).toBeLessThan(1e-5);
  });

  it('round-trips quaternion basis extraction', () => {
    const current = buildDefaultWorldBasis();
    const edge = new THREE.Vector3(1, 0, 0.3).normalize();
    const outcome = buildEdgeAlignedOrientation('z', edge, current, edge, new THREE.Vector3());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    const recovered = worldBasisFromQuaternion(outcome.quaternion);
    expect(recovered.xAxis.distanceTo(outcome.basis.xAxis)).toBeLessThan(1e-5);
    expect(recovered.yAxis.distanceTo(outcome.basis.yAxis)).toBeLessThan(1e-5);
    expect(recovered.zAxis.distanceTo(outcome.basis.zAxis)).toBeLessThan(1e-5);
  });
});
