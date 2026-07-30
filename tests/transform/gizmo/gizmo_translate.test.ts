import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { GizmoAxis } from '@/types/transform_mode.js';
import { GizmoTranslate } from '@/transform/gizmo/gizmo_translate.js';
import { GIZMO_PICK_VOLUME_USERDATA } from '@/transform/gizmo/gizmo_visual_style.js';

describe('GizmoTranslate', () => {
  let gizmo: GizmoTranslate;

  beforeEach(() => {
    gizmo = new GizmoTranslate(Theme);
  });

  it('should create three axis handles plus a free-move center handle', () => {
    const handles = gizmo.createHandles();
    expect(handles.length).toBe(4);
    expect(handles.some((handle) => handle.getAxis() === GizmoAxis.VIEW)).toBe(true);
  });

  it('should not create axis-plane squares (only free-move center)', () => {
    const handles = gizmo.createHandles();
    const planeHandles = handles.filter(
      (h) =>
        h.getAxis() === GizmoAxis.XY_PLANE || h.getAxis() === GizmoAxis.YZ_PLANE || h.getAxis() === GizmoAxis.XZ_PLANE,
    );
    expect(planeHandles.length).toBe(0);
  });

  it('should assign correct axis to X handle', () => {
    const handles = gizmo.createHandles();
    const xHandle = handles.find((h) => h.getAxis() === GizmoAxis.X);
    expect(xHandle).toBeDefined();
    expect(xHandle!.getAxis()).toBe(GizmoAxis.X);
  });

  it('should assign correct axis to Y handle', () => {
    const handles = gizmo.createHandles();
    const yHandle = handles.find((h) => h.getAxis() === GizmoAxis.Y);
    expect(yHandle).toBeDefined();
    expect(yHandle!.getAxis()).toBe(GizmoAxis.Y);
  });

  it('should assign correct axis to Z handle', () => {
    const handles = gizmo.createHandles();
    const zHandle = handles.find((h) => h.getAxis() === GizmoAxis.Z);
    expect(zHandle).toBeDefined();
    expect(zHandle!.getAxis()).toBe(GizmoAxis.Z);
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

  it('should expose thick invisible pick volumes for easier clicking', () => {
    gizmo.createHandles();
    const sceneObjects = gizmo.getAllSceneObjects();
    let pickCount = 0;
    sceneObjects.forEach((root) => {
      root.traverse((child) => {
        if (child instanceof THREE.Mesh && child.userData[GIZMO_PICK_VOLUME_USERDATA] === true) {
          pickCount += 1;
        }
      });
    });
    expect(pickCount).toBeGreaterThanOrEqual(7);
  });

  it('should have scene objects that can be added to a scene', () => {
    gizmo.createHandles();
    const sceneObjects = gizmo.getAllSceneObjects();
    expect(sceneObjects.length).toBe(4);
  });

  it('should dispose without errors', () => {
    gizmo.createHandles();
    expect(() => gizmo.dispose()).not.toThrow();
  });

  it('should clear handles on new creation', () => {
    const first = gizmo.createHandles();
    const second = gizmo.createHandles();
    expect(second.length).toBe(4);
    expect(second).not.toBe(first);
  });
});
