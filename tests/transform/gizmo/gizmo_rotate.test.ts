import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { GizmoAxis } from '@/types/transform_mode.js';
import { GizmoRotate } from '@/transform/gizmo/gizmo_rotate.js';
import {
  GIZMO_FREE_ROTATE_DISC_PICK_USERDATA,
  GIZMO_SCALE_FREE_BILLBOARD_USERDATA,
  GizmoVisualStyle,
} from '@/transform/gizmo/gizmo_visual_style.js';
import { applyGizmoCloneDepthStyle } from '@/transform/gizmo/gizmo_depth_style.js';

describe('GizmoRotate', () => {
  let gizmo: GizmoRotate;

  beforeEach(() => {
    gizmo = new GizmoRotate(Theme);
  });

  it('should create three axis rings plus a free-rotate billboard', () => {
    const handles = gizmo.createHandles();
    expect(handles.length).toBe(4);
    expect(handles.some((handle) => handle.getAxis() === GizmoAxis.VIEW)).toBe(true);
  });

  it('should have handles for X, Y, Z axes and VIEW free-rotate', () => {
    const handles = gizmo.createHandles();
    const axes = handles.map((h) => h.getAxis());
    expect(axes).toContain(GizmoAxis.X);
    expect(axes).toContain(GizmoAxis.Y);
    expect(axes).toContain(GizmoAxis.Z);
    expect(axes).toContain(GizmoAxis.VIEW);
  });

  it('should use torus geometry for axis ring handles', () => {
    const handles = gizmo.createHandles();
    const ringHandles = handles.filter((handle) => handle.getAxis() !== GizmoAxis.VIEW);
    ringHandles.forEach((handle) => {
      const mesh = handle.getVisualMesh();
      expect(mesh.geometry).toBeInstanceOf(THREE.TorusGeometry);
    });
  });

  it('should use a camera-facing circle for the free-rotate handle', () => {
    const handles = gizmo.createHandles();
    const free = handles.find((handle) => handle.getAxis() === GizmoAxis.VIEW);
    expect(free).toBeDefined();
    expect(free!.getVisualMesh().geometry).toBeInstanceOf(THREE.CircleGeometry);
  });

  it('should match free-scale ring size for the free-rotate billboard', () => {
    expect(GizmoVisualStyle.rotateFreeBillboardRadius).toBe(GizmoVisualStyle.scaleFreeRingRadius);
  });

  it('should use the shared stem radius as the ring tube thickness', () => {
    const handles = gizmo.createHandles();
    const ring = handles.find((handle) => handle.getAxis() === GizmoAxis.X)!;
    const torus = ring.getVisualMesh().geometry as THREE.TorusGeometry;
    expect(torus.parameters.tube).toBeCloseTo(GizmoVisualStyle.stemRadius, 5);
  });

  it('should attach thick ring picks and free-rotate disc picks', () => {
    gizmo.createHandles();
    let ringPickCount = 0;
    let freeDiscPickCount = 0;
    gizmo.getAllSceneObjects().forEach((root) => {
      root.traverse((child) => {
        if (!(child instanceof THREE.Mesh) || child.userData['isGizmoPickVolume'] !== true) {
          return;
        }
        if (child.userData[GIZMO_FREE_ROTATE_DISC_PICK_USERDATA] === true) {
          freeDiscPickCount += 1;
          return;
        }
        ringPickCount += 1;
      });
    });
    expect(ringPickCount).toBe(3);
    expect(freeDiscPickCount).toBeGreaterThanOrEqual(1);
  });

  it('should draw free-rotate disc in front of geometry and behind front rings', () => {
    const handles = gizmo.createHandles();
    const free = handles.find((handle) => handle.getAxis() === GizmoAxis.VIEW)!;
    const material = free.getVisualMesh().material as THREE.MeshBasicMaterial;
    expect(material.transparent).toBe(true);
    expect(material.depthTest).toBe(false);
    expect(material.opacity).toBeCloseTo(GizmoVisualStyle.rotateFreeBillboardOpacity);
    expect(free.getVisualMesh().renderOrder).toBe(GizmoVisualStyle.rotateFreeBillboardRenderOrder);
    expect(free.getVisualMesh().renderOrder).toBeLessThan(GizmoVisualStyle.frontRenderOrder);
  });

  it('should keep free-rotate disc always-on-top after perspective depth styling', () => {
    const handles = gizmo.createHandles();
    const free = handles.find((handle) => handle.getAxis() === GizmoAxis.VIEW)!;
    const material = free.getVisualMesh().material as THREE.MeshBasicMaterial;
    const root = new THREE.Group();
    root.add(free.getVisualMesh());
    applyGizmoCloneDepthStyle(root, false);
    expect(material.depthTest).toBe(false);
  });

  it('should stay translucent when active and only brighten slightly', () => {
    const handles = gizmo.createHandles();
    const free = handles.find((handle) => handle.getAxis() === GizmoAxis.VIEW)!;
    const material = free.getVisualMesh().material as THREE.MeshBasicMaterial;
    const idleColor = material.color.getHex();
    const idleOpacity = material.opacity;
    free.setHoverColor(true);
    expect(material.opacity).toBeCloseTo(idleOpacity);
    expect(material.opacity).toBeLessThan(0.4);
    expect(material.color.getHex()).not.toBe(0xffffff);
    free.setHoverColor(false);
    expect(material.opacity).toBeCloseTo(idleOpacity);
    expect(material.color.getHex()).toBe(idleColor);
  });

  it('should billboard the free-rotate disc root', () => {
    gizmo.createHandles();
    const billboard = gizmo
      .getAllSceneObjects()
      .find((root) => root.userData[GIZMO_SCALE_FREE_BILLBOARD_USERDATA] === true);
    expect(billboard).toBeDefined();
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

  it('should return scene objects for rings and free-rotate billboard', () => {
    gizmo.createHandles();
    const sceneObjects = gizmo.getAllSceneObjects();
    expect(sceneObjects.length).toBe(4);
  });
});
