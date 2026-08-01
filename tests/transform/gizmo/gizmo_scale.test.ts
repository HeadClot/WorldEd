import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { GizmoAxis } from '@/types/transform_mode.js';
import { GizmoScale } from '@/transform/gizmo/gizmo_scale.js';
import { GIZMO_SCALE_FREE_BILLBOARD_USERDATA } from '@/transform/gizmo/gizmo_visual_style.js';

describe('GizmoScale', () => {
  let gizmo: GizmoScale;

  beforeEach(() => {
    gizmo = new GizmoScale(Theme);
  });

  it('should create three axis handles plus a free-scale center handle', () => {
    const handles = gizmo.createHandles();
    expect(handles.length).toBe(4);
    expect(handles.some((handle) => handle.getAxis() === GizmoAxis.VIEW)).toBe(true);
  });

  it('should have handles for X, Y, Z axes and VIEW center', () => {
    const handles = gizmo.createHandles();
    const axes = handles.map((h) => h.getAxis());
    expect(axes).toContain(GizmoAxis.X);
    expect(axes).toContain(GizmoAxis.Y);
    expect(axes).toContain(GizmoAxis.Z);
    expect(axes).toContain(GizmoAxis.VIEW);
  });

  it('should use center color for the free-scale cube', () => {
    const handles = gizmo.createHandles();
    const center = handles.find((h) => h.getAxis() === GizmoAxis.VIEW);
    expect(center).toBeDefined();
    expect(center!.getColor()).toBe(Theme.gizmoCenterColor);
  });

  it('should use correct colors for axis handles', () => {
    const handles = gizmo.createHandles();
    const xHandle = handles.find((h) => h.getAxis() === GizmoAxis.X)!;
    const yHandle = handles.find((h) => h.getAxis() === GizmoAxis.Y)!;
    const zHandle = handles.find((h) => h.getAxis() === GizmoAxis.Z)!;
    expect(xHandle.getColor()).toBe(Theme.gizmoXAxisColor);
    expect(yHandle.getColor()).toBe(Theme.gizmoYAxisColor);
    expect(zHandle.getColor()).toBe(Theme.gizmoZAxisColor);
  });

  it('should have valid visual meshes for all handles', () => {
    const handles = gizmo.createHandles();
    handles.forEach((handle) => {
      const mesh = handle.getVisualMesh();
      expect(mesh).toBeInstanceOf(THREE.Mesh);
    });
  });

  it('should return scene objects for axes, center cube, and free-scale ring', () => {
    gizmo.createHandles();
    const sceneObjects = gizmo.getAllSceneObjects();
    expect(sceneObjects.length).toBe(5);
    expect(sceneObjects.some((root) => root.userData[GIZMO_SCALE_FREE_BILLBOARD_USERDATA] === true)).toBe(true);
  });

  it('should dispose without errors', () => {
    gizmo.createHandles();
    expect(() => gizmo.dispose()).not.toThrow();
  });
});
