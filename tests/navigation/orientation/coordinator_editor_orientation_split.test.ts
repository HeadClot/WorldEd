import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { CoordinatorEditorOrientation } from '@/navigation/orientation/coordinator_editor_orientation.js';
import { EDITOR_DEFAULT_UP } from '@/navigation/orientation/editor_orientation_basis.js';

describe('CoordinatorEditorOrientation grid/camera split', () => {
  it('aligns the grid to a face without changing camera orientation', () => {
    const status = vi.fn();
    const coordinator = new CoordinatorEditorOrientation({
      getViewports: () => [],
      showStatusMessage: status,
    });
    const wallNormal = new THREE.Vector3(1, 0, 0);
    const pivot = new THREE.Vector3(2, 3, 4);
    coordinator.alignGridToFace(wallNormal, pivot);
    expect(coordinator.getGridOrientation().getUp().distanceTo(wallNormal)).toBeLessThan(1e-5);
    expect(coordinator.getCameraOrientation().isDefault()).toBe(true);
    expect(coordinator.getGridOrientation().getPlaneFrame().origin.distanceTo(pivot)).toBeLessThan(1e-8);
    coordinator.dispose();
  });

  it('resets the grid without resetting the camera orientation store', () => {
    const coordinator = new CoordinatorEditorOrientation({
      getViewports: () => [],
      showStatusMessage: () => undefined,
    });
    coordinator.getCameraOrientation().setFromFaceNormal(new THREE.Vector3(0, 0, 1), new THREE.Vector3());
    coordinator.alignGridToFace(new THREE.Vector3(1, 0, 0), new THREE.Vector3());
    coordinator.resetGridToDefault();
    expect(coordinator.getGridOrientation().isDefault()).toBe(true);
    expect(coordinator.getCameraOrientation().isDefault()).toBe(false);
    coordinator.dispose();
  });

  it('aligns a grid axis to an edge while leaving the camera default', () => {
    const coordinator = new CoordinatorEditorOrientation({
      getViewports: () => [],
      showStatusMessage: () => undefined,
    });
    const edge = new THREE.Vector3(1, 0, 1).normalize();
    const applied = coordinator.alignGridAxisToEdge('z', edge, new THREE.Vector3(0, 1, 0), edge);
    expect(applied).toBe(true);
    const zAxis = coordinator.getGridOrientation().getZAxis();
    expect(zAxis.dot(edge)).toBeCloseTo(1, 5);
    expect(coordinator.getGridOrientation().getUp().distanceTo(EDITOR_DEFAULT_UP)).toBeLessThan(1e-5);
    expect(coordinator.getCameraOrientation().isDefault()).toBe(true);
    coordinator.dispose();
  });

  it('keeps grid default when camera face-align is invoked', () => {
    const coordinator = new CoordinatorEditorOrientation({
      getViewports: () => [],
      showStatusMessage: () => undefined,
    });
    coordinator.alignGridToFace(new THREE.Vector3(1, 0, 0), new THREE.Vector3(4, 5, 6));
    const gridUpBefore = coordinator.getGridOrientation().getUp().clone();
    coordinator.alignCameraToFace(new THREE.Vector3(0, 0, 1), new THREE.Vector3());
    expect(coordinator.getGridOrientation().getUp().distanceTo(gridUpBefore)).toBeLessThan(1e-8);
    coordinator.dispose();
  });
});
