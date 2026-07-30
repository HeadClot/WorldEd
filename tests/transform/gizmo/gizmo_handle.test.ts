import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { GizmoAxis } from '@/types/transform_mode.js';
import { GizmoHandle } from '@/transform/gizmo/gizmo_handle.js';

describe('GizmoHandle', () => {
  let handle: GizmoHandle;
  let mesh: THREE.Mesh;

  beforeEach(() => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    mesh = new THREE.Mesh(geometry, material);
    handle = new GizmoHandle(GizmoAxis.X, 0xff0000, mesh);
  });

  it('should return the correct axis', () => {
    expect(handle.getAxis()).toBe(GizmoAxis.X);
  });

  it('should return the base color', () => {
    expect(handle.getColor()).toBe(0xff0000);
  });

  it('should return the visual mesh', () => {
    expect(handle.getVisualMesh()).toBe(mesh);
  });

  it('should update base color and mesh color when setColor is called', () => {
    handle.setColor(0x00ff00);
    expect(handle.getColor()).toBe(0x00ff00);
    const material = mesh.material as THREE.MeshStandardMaterial;
    expect(material.color.getHex()).toBe(0x00ff00);
  });

  it('should set hover state and update mesh to hover color', () => {
    handle.setHoverColor(true);
    expect(handle.isHoveredState()).toBe(true);
    const material = mesh.material as THREE.MeshStandardMaterial;
    expect(material.color.getHex()).toBe(0xffffff);
  });

  it('should revert mesh to base color when hover is cleared', () => {
    handle.setHoverColor(true);
    handle.setHoverColor(false);
    expect(handle.isHoveredState()).toBe(false);
    const material = mesh.material as THREE.MeshStandardMaterial;
    expect(material.color.getHex()).toBe(0xff0000);
  });

  it('should use custom hover color when set', () => {
    handle.setHoverColorValue(0x0000ff);
    handle.setHoverColor(true);
    const material = mesh.material as THREE.MeshStandardMaterial;
    expect(material.color.getHex()).toBe(0x0000ff);
  });

  it('should start with non-hovered state', () => {
    expect(handle.isHoveredState()).toBe(false);
  });

  it('should handle Y axis handle correctly', () => {
    const yHandle = new GizmoHandle(GizmoAxis.Y, Theme.gizmoYAxisColor, mesh);
    expect(yHandle.getAxis()).toBe(GizmoAxis.Y);
    expect(yHandle.getColor()).toBe(Theme.gizmoYAxisColor);
  });

  it('should handle Z axis handle correctly', () => {
    const zHandle = new GizmoHandle(GizmoAxis.Z, Theme.gizmoZAxisColor, mesh);
    expect(zHandle.getAxis()).toBe(GizmoAxis.Z);
    expect(zHandle.getColor()).toBe(Theme.gizmoZAxisColor);
  });

  it('should handle plane axis handle correctly', () => {
    const planeHandle = new GizmoHandle(GizmoAxis.XY_PLANE, 0xffaa33, mesh);
    expect(planeHandle.getAxis()).toBe(GizmoAxis.XY_PLANE);
    expect(planeHandle.getColor()).toBe(0xffaa33);
  });

  it('should hover the stem as well as the tip when they share a handle id', () => {
    const group = new THREE.Group();
    const stemMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.9 });
    const tipMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.9 });
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 8), stemMaterial);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), tipMaterial);
    const multiHandle = new GizmoHandle(GizmoAxis.X, 0xff0000, tip);
    const handleId = multiHandle.getHandleId();
    stem.userData['handleId'] = handleId;
    tip.userData['handleId'] = handleId;
    group.add(stem, tip);
    multiHandle.setHoverColor(true);
    expect(tipMaterial.color.getHex()).toBe(0xffffff);
    expect(stemMaterial.color.getHex()).toBe(0xffffff);
    multiHandle.setHoverColor(false);
    expect(tipMaterial.color.getHex()).toBe(0xff0000);
    expect(stemMaterial.color.getHex()).toBe(0xff0000);
  });
});
