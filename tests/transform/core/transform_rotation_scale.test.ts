import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { TransformExecutor } from '@/transform/core/transform_executor.js';
import { TransformConstraint } from '@/transform/core/transform_constraint.js';

describe('TransformExecutor world-space rotation under parents', () => {
  it('keeps a child brush hull center fixed when rotating about its world pivot', () => {
    const executor = new TransformExecutor(new GridSnap(false, 1.0));
    const parent = new THREE.Group();
    parent.position.set(10, 0, 0);
    parent.updateMatrixWorld(true);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    parent.add(mesh);
    mesh.position.set(0, 0, 0);
    mesh.quaternion.identity();
    mesh.updateMatrixWorld(true);
    const worldPivot = mesh.getWorldPosition(new THREE.Vector3());
    const initials = new Map<THREE.Object3D, THREE.Vector3>();
    const quats = new Map<THREE.Object3D, THREE.Quaternion>();
    initials.set(mesh, mesh.position.clone());
    quats.set(mesh, mesh.quaternion.clone());
    const ninety = Math.PI / 2;
    executor.applyAbsoluteRotation([mesh], initials, quats, worldPivot, new THREE.Vector3(0, 1, 0), ninety);
    mesh.updateMatrixWorld(true);
    const after = mesh.getWorldPosition(new THREE.Vector3());
    expect(after.x).toBeCloseTo(worldPivot.x, 5);
    expect(after.y).toBeCloseTo(worldPivot.y, 5);
    expect(after.z).toBeCloseTo(worldPivot.z, 5);
    const worldQuat = mesh.getWorldQuaternion(new THREE.Quaternion());
    const expected = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ninety);
    expect(worldQuat.angleTo(expected)).toBeLessThan(1e-5);
  });
});

describe('TransformExecutor rotation snapping', () => {
  it('should snap rotation angles when snap is enabled', () => {
    const executor = new TransformExecutor(new GridSnap(true, 1.0));
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.position.set(0, 0, 0);
    mesh.quaternion.identity();
    const initials = new Map<THREE.Mesh, THREE.Vector3>();
    const quats = new Map<THREE.Mesh, THREE.Quaternion>();
    initials.set(mesh, mesh.position.clone());
    quats.set(mesh, mesh.quaternion.clone());
    const twelveDegrees = (12 * Math.PI) / 180;
    executor.applyAbsoluteRotation(
      [mesh],
      initials,
      quats,
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 1, 0),
      twelveDegrees,
    );
    const euler = new THREE.Euler().setFromQuaternion(mesh.quaternion, 'YXZ');
    expect(euler.y).toBeCloseTo((15 * Math.PI) / 180, 4);
  });

  it('should not snap rotation when snap is disabled', () => {
    const executor = new TransformExecutor(new GridSnap(false, 1.0));
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.quaternion.identity();
    const initials = new Map<THREE.Mesh, THREE.Vector3>();
    const quats = new Map<THREE.Mesh, THREE.Quaternion>();
    initials.set(mesh, mesh.position.clone());
    quats.set(mesh, mesh.quaternion.clone());
    const twelveDegrees = (12 * Math.PI) / 180;
    executor.applyAbsoluteRotation(
      [mesh],
      initials,
      quats,
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 1, 0),
      twelveDegrees,
    );
    const euler = new THREE.Euler().setFromQuaternion(mesh.quaternion, 'YXZ');
    expect(euler.y).toBeCloseTo(twelveDegrees, 4);
  });
});

describe('TransformExecutor scale snapping', () => {
  it('should snap scale factors when snap is enabled', () => {
    const executor = new TransformExecutor(new GridSnap(true, 1.0));
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.scale.set(1, 1, 1);
    const initials = new Map<THREE.Mesh, THREE.Vector3>();
    const scales = new Map<THREE.Mesh, THREE.Vector3>();
    initials.set(mesh, mesh.position.clone());
    scales.set(mesh, mesh.scale.clone());
    executor.applyAbsoluteScale([mesh], initials, scales, new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), 1.24);
    expect(mesh.scale.x).toBeCloseTo(1.2);
  });

  it('should not snap scale factors when snap is disabled', () => {
    const executor = new TransformExecutor(new GridSnap(false, 1.0));
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.scale.set(1, 1, 1);
    const initials = new Map<THREE.Mesh, THREE.Vector3>();
    const scales = new Map<THREE.Mesh, THREE.Vector3>();
    initials.set(mesh, mesh.position.clone());
    scales.set(mesh, mesh.scale.clone());
    executor.applyAbsoluteScale([mesh], initials, scales, new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), 1.37);
    expect(mesh.scale.x).toBeCloseTo(1.37);
  });
});

describe('TransformConstraint helpers used by gizmo drags', () => {
  it('should compute signed rotation angles around an axis', () => {
    const initial = new THREE.Vector3(1, 0, 0);
    const current = new THREE.Vector3(0, 0, 1);
    const axis = new THREE.Vector3(0, 1, 0);
    const angle = TransformConstraint.computeRotationAngle(initial, current, axis);
    expect(Math.abs(angle)).toBeCloseTo(Math.PI / 2, 4);
  });

  it('should compute scale factors from distance ratios', () => {
    expect(TransformConstraint.computeScaleFactor(2, 4)).toBeCloseTo(2);
    expect(TransformConstraint.computeScaleFactor(1, 0.5)).toBeCloseTo(0.5);
  });
});

describe('Shape Editor radial scale equations', () => {
  it('matches GetMoveScale distance ratio for free scale', () => {
    const pivot = new THREE.Vector3(0, 0, 0);
    const mouseStart = new THREE.Vector3(4, 0, 0);
    const mouseNow = new THREE.Vector3(8, 0, 0);
    const initialDistance = mouseStart.distanceTo(pivot);
    const currentDistance = mouseNow.distanceTo(pivot);
    expect(TransformConstraint.computeScaleFactor(initialDistance, currentDistance)).toBeCloseTo(2);
  });

  it('uses radial distance so off-axis picks do not inflate the factor', () => {
    const pivot = new THREE.Vector3(0, 0, 0);
    const offAxisPick = new THREE.Vector3(0.2, 4, 0);
    const mouseAlongAxis = new THREE.Vector3(4, 0, 0);
    const projectionFactor = TransformConstraint.computeScaleFactor(offAxisPick.x, mouseAlongAxis.x);
    const radialFactor = TransformConstraint.computeScaleFactor(
      offAxisPick.distanceTo(pivot),
      mouseAlongAxis.distanceTo(pivot),
    );
    expect(projectionFactor).toBeCloseTo(20);
    expect(radialFactor).toBeCloseTo(1, 0);
    expect(radialFactor).toBeLessThan(projectionFactor);
  });

  it('ScaleAroundPivot keeps a point under the mouse when factor doubles', () => {
    const pivot = new THREE.Vector3(1, 2, 0);
    const point = new THREE.Vector3(5, 2, 0);
    const scaled = TransformConstraint.scalePointAroundPivot(point, pivot, 2, 2, 2);
    expect(scaled.x).toBeCloseTo(9);
    expect(scaled.y).toBeCloseTo(2);
  });

  it('uniform scale under a parent keeps world orbit about the world pivot', () => {
    const executor = new TransformExecutor(new GridSnap(false, 1.0));
    const parent = new THREE.Group();
    parent.position.set(10, 0, 0);
    parent.updateMatrixWorld(true);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    parent.add(mesh);
    mesh.position.set(2, 0, 0);
    mesh.scale.set(1, 1, 1);
    mesh.updateMatrixWorld(true);
    const worldPivot = new THREE.Vector3(10, 0, 0);
    const initials = new Map<THREE.Object3D, THREE.Vector3>();
    const scales = new Map<THREE.Object3D, THREE.Vector3>();
    initials.set(mesh, mesh.position.clone());
    scales.set(mesh, mesh.scale.clone());
    executor.applyAbsoluteUniformScale([mesh], initials, scales, worldPivot, 2);
    mesh.updateMatrixWorld(true);
    const worldPos = mesh.getWorldPosition(new THREE.Vector3());
    expect(worldPos.x).toBeCloseTo(14);
    expect(worldPos.y).toBeCloseTo(0);
    expect(mesh.scale.x).toBeCloseTo(2);
    expect(mesh.scale.y).toBeCloseTo(2);
    expect(mesh.scale.z).toBeCloseTo(2);
  });
});
