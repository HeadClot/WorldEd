import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { TransformExecutor } from '@/transform/core/transform_executor.js';
import { notificationFrameEvents } from '@/audio/notification/notification_frame_events.js';
import { audioSettings } from '@/audio/settings/audio_settings.js';

describe('TransformExecutor.computePivot', () => {
  let executor: TransformExecutor;

  beforeEach(() => {
    executor = new TransformExecutor(new GridSnap(false, 1.0));
  });

  it('should return origin for empty object list', () => {
    const pivot = executor.computePivot([]);
    expect(pivot.x).toBe(0);
    expect(pivot.y).toBe(0);
    expect(pivot.z).toBe(0);
  });

  it('should return single object position as pivot', () => {
    const mesh = new THREE.Mesh();
    mesh.position.set(5, 10, 15);
    const pivot = executor.computePivot([mesh]);
    expect(pivot.x).toBe(5);
    expect(pivot.y).toBe(10);
    expect(pivot.z).toBe(15);
  });

  it('should compute bounding box center for multiple objects with geometry', () => {
    const mesh1 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh1.position.set(0, 0, 0);
    const mesh2 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh2.position.set(10, 10, 10);
    const pivot = executor.computePivot([mesh1, mesh2]);
    expect(pivot.x).toBeCloseTo(5, 1);
    expect(pivot.y).toBeCloseTo(5, 1);
    expect(pivot.z).toBeCloseTo(5, 1);
  });
});

describe('TransformExecutor.executeTranslation', () => {
  let executor: TransformExecutor;

  beforeEach(() => {
    executor = new TransformExecutor(new GridSnap(false, 1.0));
  });

  it('should translate objects by delta', () => {
    const mesh = new THREE.Mesh();
    mesh.position.set(0, 0, 0);
    executor.executeTranslation([mesh], new THREE.Vector3(1, 2, 3));
    expect(mesh.position.x).toBe(1);
    expect(mesh.position.y).toBe(2);
    expect(mesh.position.z).toBe(3);
  });

  it('should translate multiple objects', () => {
    const mesh1 = new THREE.Mesh();
    mesh1.position.set(0, 0, 0);
    const mesh2 = new THREE.Mesh();
    mesh2.position.set(10, 10, 10);
    executor.executeTranslation([mesh1, mesh2], new THREE.Vector3(5, 5, 5));
    expect(mesh1.position.x).toBe(5);
    expect(mesh1.position.y).toBe(5);
    expect(mesh1.position.z).toBe(5);
    expect(mesh2.position.x).toBe(15);
    expect(mesh2.position.y).toBe(15);
    expect(mesh2.position.z).toBe(15);
  });

  it('should snap the movement delta when snap is enabled', () => {
    const snapEnabled = new GridSnap(true, 1.0);
    const snapExecutor = new TransformExecutor(snapEnabled);
    const mesh = new THREE.Mesh();
    mesh.position.set(0, 0, 0);
    snapExecutor.executeTranslation([mesh], new THREE.Vector3(0.4, 0.6, 0.2));
    expect(mesh.position.x).toBe(0);
    expect(mesh.position.y).toBe(1);
    expect(mesh.position.z).toBe(0);
  });

  it('should apply absolute translation from initial positions', () => {
    const mesh = new THREE.Mesh();
    mesh.position.set(1, 1, 1);
    const initials = new Map<THREE.Mesh, THREE.Vector3>();
    initials.set(mesh, new THREE.Vector3(0, 0, 0));
    executor.applyAbsoluteTranslation([mesh], initials, new THREE.Vector3(2, 3, 4));
    expect(mesh.position.x).toBe(2);
    expect(mesh.position.y).toBe(3);
    expect(mesh.position.z).toBe(4);
  });

  it('should preserve off-grid offsets while snapping the shared delta', () => {
    const snapExecutor = new TransformExecutor(new GridSnap(true, 1.0));
    const mesh = new THREE.Mesh();
    mesh.position.set(0.3, 0.7, 0.2);
    const initials = new Map<THREE.Mesh, THREE.Vector3>();
    initials.set(mesh, new THREE.Vector3(0.3, 0.7, 0.2));
    snapExecutor.applyAbsoluteTranslation([mesh], initials, new THREE.Vector3(1.1, 0, 0));
    expect(mesh.position.x).toBeCloseTo(1.3);
    expect(mesh.position.y).toBeCloseTo(0.7);
    expect(mesh.position.z).toBeCloseTo(0.2);
  });

  it('should not force off-grid odd-sized objects onto the grid during a tiny drag', () => {
    const snapExecutor = new TransformExecutor(new GridSnap(true, 0.25));
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.position.set(1.1, 1.875, 2.4);
    mesh.scale.set(0.5, 3.75, 3.0);
    const start = mesh.position.clone();
    const initials = new Map<THREE.Mesh, THREE.Vector3>();
    initials.set(mesh, start.clone());
    snapExecutor.applyAbsoluteTranslation([mesh], initials, new THREE.Vector3(0, 0.05, 0));
    expect(mesh.position.x).toBeCloseTo(1.1, 5);
    expect(mesh.position.y).toBeCloseTo(1.875, 5);
    expect(mesh.position.z).toBeCloseTo(2.4, 5);
  });

  it('should move off-grid objects by whole grid steps without changing relative offset', () => {
    const snapExecutor = new TransformExecutor(new GridSnap(true, 0.25));
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.position.set(1.1, 1.875, 2.4);
    const start = mesh.position.clone();
    const initials = new Map<THREE.Mesh, THREE.Vector3>();
    initials.set(mesh, start.clone());
    snapExecutor.applyAbsoluteTranslation([mesh], initials, new THREE.Vector3(0, 0.3, 0));
    expect(mesh.position.x).toBeCloseTo(1.1, 5);
    expect(mesh.position.y).toBeCloseTo(2.125, 5);
    expect(mesh.position.z).toBeCloseTo(2.4, 5);
  });

  it('should keep multi-selection relative spacing when objects start off-grid', () => {
    const snapExecutor = new TransformExecutor(new GridSnap(true, 0.25));
    const meshA = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1));
    const meshB = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1));
    meshA.position.set(0.13, 0.07, 0.19);
    meshB.position.set(0.41, 0.33, 0.52);
    const relativeBefore = meshB.position.clone().sub(meshA.position);
    const initials = new Map<THREE.Object3D, THREE.Vector3>([
      [meshA, meshA.position.clone()],
      [meshB, meshB.position.clone()],
    ]);
    snapExecutor.applyAbsoluteTranslation([meshA, meshB], initials, new THREE.Vector3(0.37, 0.11, 0.19));
    const relativeAfter = meshB.position.clone().sub(meshA.position);
    expect(relativeAfter.distanceTo(relativeBefore)).toBeLessThan(1e-8);
    expect(meshA.position.x).toBeCloseTo(0.38, 5);
    expect(meshA.position.y).toBeCloseTo(0.07, 5);
    expect(meshA.position.z).toBeCloseTo(0.44, 5);
  });
});

describe('TransformExecutor snapped translation audio events', () => {
  beforeEach(() => {
    audioSettings.setEnabled(true);
    notificationFrameEvents.reset();
  });

  afterEach(() => {
    audioSettings.setEnabled(true);
    notificationFrameEvents.reset();
  });

  it('raises selection-moved-with-snapping once after multi-object snap step', () => {
    const snapExecutor = new TransformExecutor(new GridSnap(true, 1.0));
    const meshA = new THREE.Mesh();
    const meshB = new THREE.Mesh();
    meshA.position.set(0, 0, 0);
    meshB.position.set(2, 0, 0);
    const initials = new Map<THREE.Object3D, THREE.Vector3>([
      [meshA, meshA.position.clone()],
      [meshB, meshB.position.clone()],
    ]);
    snapExecutor.applyAbsoluteTranslation([meshA, meshB], initials, new THREE.Vector3(1.2, 0, 0));
    notificationFrameEvents.beginFrame();
    expect(notificationFrameEvents.hasSelectionMovedWithSnappingSnapshot()).toBe(true);
    expect(notificationFrameEvents.hasSelectionScaledWithSnappingSnapshot()).toBe(false);
  });

  it('raises selection-scaled-with-snapping when free scale snaps to a new step', () => {
    const snapExecutor = new TransformExecutor(new GridSnap(true, 1.0));
    const mesh = new THREE.Mesh();
    mesh.position.set(0, 0, 0);
    mesh.scale.set(1, 1, 1);
    const initials = new Map<THREE.Object3D, THREE.Vector3>([[mesh, mesh.position.clone()]]);
    const scales = new Map<THREE.Object3D, THREE.Vector3>([[mesh, mesh.scale.clone()]]);
    snapExecutor.applyAbsoluteFreeScale(
      [mesh],
      initials,
      scales,
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1.15, 1, 1),
    );
    notificationFrameEvents.beginFrame();
    expect(notificationFrameEvents.hasSelectionScaledWithSnappingSnapshot()).toBe(true);
    expect(notificationFrameEvents.hasSelectionMovedWithSnappingSnapshot()).toBe(false);
  });

  it('pitches scale snaps from factor travel, not snap-step count', () => {
    const snapExecutor = new TransformExecutor(new GridSnap(true, 1.0, 15, 0.1));
    const mesh = new THREE.Mesh();
    mesh.position.set(0, 0, 0);
    mesh.scale.set(1, 1, 1);
    const initials = new Map<THREE.Object3D, THREE.Vector3>([[mesh, mesh.position.clone()]]);
    const scales = new Map<THREE.Object3D, THREE.Vector3>([[mesh, mesh.scale.clone()]]);
    snapExecutor.applyAbsoluteFreeScale(
      [mesh],
      initials,
      scales,
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1.7, 1, 1),
    );
    notificationFrameEvents.beginFrame();
    expect(notificationFrameEvents.hasSelectionScaledWithSnappingSnapshot()).toBe(true);
    expect(notificationFrameEvents.getSelectionResizeTravelSnapshot()).toBeCloseTo(0.7, 5);
    expect(notificationFrameEvents.getSelectionResizeTravelSnapshot()).toBeLessThan(2);
  });

  it('does not raise when snap is disabled', () => {
    const snapExecutor = new TransformExecutor(new GridSnap(false, 1.0));
    const mesh = new THREE.Mesh();
    const initials = new Map<THREE.Object3D, THREE.Vector3>([[mesh, new THREE.Vector3(0, 0, 0)]]);
    snapExecutor.applyAbsoluteTranslation([mesh], initials, new THREE.Vector3(1, 0, 0));
    notificationFrameEvents.beginFrame();
    expect(notificationFrameEvents.hasSelectionMovedWithSnappingSnapshot()).toBe(false);
  });

  it('does not raise again for the same snapped delta', () => {
    const snapExecutor = new TransformExecutor(new GridSnap(true, 1.0));
    const mesh = new THREE.Mesh();
    const initials = new Map<THREE.Object3D, THREE.Vector3>([[mesh, new THREE.Vector3(0, 0, 0)]]);
    snapExecutor.applyAbsoluteTranslation([mesh], initials, new THREE.Vector3(1.1, 0, 0));
    notificationFrameEvents.beginFrame();
    expect(notificationFrameEvents.hasSelectionMovedWithSnappingSnapshot()).toBe(true);
    notificationFrameEvents.beginFrame();
    snapExecutor.applyAbsoluteTranslation([mesh], initials, new THREE.Vector3(1.2, 0, 0));
    notificationFrameEvents.beginFrame();
    expect(notificationFrameEvents.hasSelectionMovedWithSnappingSnapshot()).toBe(false);
  });

  it('raises again when the snapped delta steps to a new value', () => {
    const snapExecutor = new TransformExecutor(new GridSnap(true, 1.0));
    const mesh = new THREE.Mesh();
    const initials = new Map<THREE.Object3D, THREE.Vector3>([[mesh, new THREE.Vector3(0, 0, 0)]]);
    snapExecutor.applyAbsoluteTranslation([mesh], initials, new THREE.Vector3(1.1, 0, 0));
    snapExecutor.applyAbsoluteTranslation([mesh], initials, new THREE.Vector3(2.1, 0, 0));
    notificationFrameEvents.beginFrame();
    expect(notificationFrameEvents.hasSelectionMovedWithSnappingSnapshot()).toBe(true);
  });

  it('raises again after clearSnappedTranslationStepTracking', () => {
    const snapExecutor = new TransformExecutor(new GridSnap(true, 1.0));
    const mesh = new THREE.Mesh();
    const initials = new Map<THREE.Object3D, THREE.Vector3>([[mesh, new THREE.Vector3(0, 0, 0)]]);
    snapExecutor.applyAbsoluteTranslation([mesh], initials, new THREE.Vector3(1, 0, 0));
    snapExecutor.clearSnappedTranslationStepTracking();
    notificationFrameEvents.beginFrame();
    snapExecutor.applyAbsoluteTranslation([mesh], initials, new THREE.Vector3(1, 0, 0));
    notificationFrameEvents.beginFrame();
    expect(notificationFrameEvents.hasSelectionMovedWithSnappingSnapshot()).toBe(true);
  });
});

describe('TransformExecutor.executeRotation', () => {
  let executor: TransformExecutor;

  beforeEach(() => {
    executor = new TransformExecutor(new GridSnap(false, 1.0));
  });

  it('should rotate object around pivot', () => {
    const mesh = new THREE.Mesh();
    mesh.position.set(1, 0, 0);
    const pivot = new THREE.Vector3(0, 0, 0);
    const axis = new THREE.Vector3(0, 0, 1);
    const angle = Math.PI / 2;
    executor.executeRotation([mesh], pivot, axis, angle);
    expect(mesh.position.x).toBeCloseTo(0, 1);
    expect(mesh.position.y).toBeCloseTo(1, 1);
  });

  it('should update object quaternion during rotation', () => {
    const mesh = new THREE.Mesh();
    mesh.position.set(1, 0, 0);
    const before = mesh.quaternion.clone();
    executor.executeRotation([mesh], new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1), Math.PI / 2);
    expect(mesh.quaternion.equals(before)).toBe(false);
  });

  it('should rotate multiple objects', () => {
    const mesh1 = new THREE.Mesh();
    mesh1.position.set(1, 0, 0);
    const mesh2 = new THREE.Mesh();
    mesh2.position.set(0, 1, 0);
    const pivot = new THREE.Vector3(0, 0, 0);
    const axis = new THREE.Vector3(0, 0, 1);
    const angle = Math.PI;
    executor.executeRotation([mesh1, mesh2], pivot, axis, angle);
    expect(mesh1.position.x).toBeCloseTo(-1, 1);
    expect(mesh1.position.y).toBeCloseTo(0, 1);
    expect(mesh2.position.x).toBeCloseTo(0, 1);
    expect(mesh2.position.y).toBeCloseTo(-1, 1);
  });
});

describe('TransformExecutor.executeScale', () => {
  let executor: TransformExecutor;

  beforeEach(() => {
    executor = new TransformExecutor(new GridSnap(false, 1.0));
  });

  it('should scale object along axis from pivot', () => {
    const mesh = new THREE.Mesh();
    mesh.position.set(2, 0, 0);
    const pivot = new THREE.Vector3(0, 0, 0);
    const axis = new THREE.Vector3(1, 0, 0);
    executor.executeScale([mesh], pivot, axis, 2.0);
    expect(mesh.position.x).toBeCloseTo(4, 1);
    expect(mesh.position.y).toBeCloseTo(0, 1);
    expect(mesh.position.z).toBeCloseTo(0, 1);
  });

  it('should update mesh.scale along axis', () => {
    const mesh = new THREE.Mesh();
    mesh.position.set(0, 0, 0);
    executor.executeScale([mesh], new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), 2.0);
    expect(mesh.scale.x).toBeCloseTo(2);
    expect(mesh.scale.y).toBeCloseTo(1);
  });

  it('should preserve perpendicular components during scale', () => {
    const mesh = new THREE.Mesh();
    mesh.position.set(2, 3, 0);
    const pivot = new THREE.Vector3(0, 0, 0);
    const axis = new THREE.Vector3(1, 0, 0);
    executor.executeScale([mesh], pivot, axis, 2.0);
    expect(mesh.position.x).toBeCloseTo(4, 1);
    expect(mesh.position.y).toBeCloseTo(3, 1);
  });
});

describe('TransformExecutor.getGridSnap', () => {
  it('should return the grid snap instance', () => {
    const snap = new GridSnap(true, 2.0);
    const executor = new TransformExecutor(snap);
    expect(executor.getGridSnap()).toBe(snap);
    expect(executor.getGridSnap().isEnabled()).toBe(true);
    expect(executor.getGridSnap().getInterval()).toBe(2.0);
  });
});
