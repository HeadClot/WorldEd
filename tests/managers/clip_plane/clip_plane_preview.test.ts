import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { ClipPlanePreview } from '../../../src/managers/clip_plane/clip_plane_preview.js';
import { ClipPlaneTool } from '../../../src/managers/clip_plane/clip_plane_tool.js';
import { CLIP_MARKER_HALO_RADIUS } from '../../../src/managers/clip_plane/clip_plane_marker_style.js';
import { Theme } from '../../../src/theme.js';

describe('ClipPlanePreview', () => {
  let preview: ClipPlanePreview;
  let tool: ClipPlaneTool;

  beforeEach(() => {
    preview = new ClipPlanePreview();
    tool = new ClipPlaneTool();
  });

  it('should use compact professional marker radii', () => {
    expect(CLIP_MARKER_HALO_RADIUS).toBeGreaterThan(0.015);
    expect(CLIP_MARKER_HALO_RADIUS).toBeLessThan(0.06);
  });

  it('should color placement markers yellow', () => {
    tool.activate();
    tool.addPoint(new THREE.Vector3(0, 0, 0));
    preview.syncFromTool(tool);
    let markerColor: number | null = null;
    preview.getRoot().traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const material = child.material as THREE.MeshBasicMaterial;
      if (material.color) {
        markerColor = material.color.getHex();
      }
    });
    expect(markerColor).toBe(Theme.clipMarkerColor);
  });

  it('should create marker groups when the tool has points', () => {
    tool.activate();
    tool.addPoint(new THREE.Vector3(0, 0, 0));
    tool.addPoint(new THREE.Vector3(1, 0, 0));
    preview.syncFromTool(tool);
    const markerGroups = preview.getRoot().children.filter((child) => child instanceof THREE.Group);
    expect(markerGroups.length).toBe(2);
  });

  it('should scale markers with camera distance without exploding size', () => {
    tool.activate();
    tool.addPoint(new THREE.Vector3(0, 0, 0));
    preview.syncFromTool(tool);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 10);
    camera.updateMatrixWorld(true);
    preview.updateMarkerScalesForCamera(camera);
    const group = preview.getRoot().children.find((child) => child instanceof THREE.Group) as THREE.Group;
    expect(group.scale.x).toBeGreaterThan(0);
    expect(group.scale.x).toBeLessThan(5);
  });

  it('should clear visuals when the tool is inactive', () => {
    tool.activate();
    tool.addPoint(new THREE.Vector3(0, 0, 0));
    preview.syncFromTool(tool);
    expect(preview.getRoot().children.length).toBeGreaterThan(0);
    tool.deactivate();
    preview.syncFromTool(tool);
    expect(preview.getRoot().children.length).toBe(0);
  });

  it('should draw the keep-side flip arrow without depth testing so it stays visible', () => {
    tool.activate();
    tool.addPoint(new THREE.Vector3(0, 0, 0));
    tool.addPoint(new THREE.Vector3(2, 0, 0));
    tool.addPoint(new THREE.Vector3(0, 2, 0));
    preview.syncFromTool(tool);
    const arrow = preview.getRoot().children.find((child) => child instanceof THREE.ArrowHelper);
    expect(arrow).toBeDefined();
    let styledParts = 0;
    arrow!.traverse((child) => {
      const materialOwner = child as THREE.Mesh | THREE.Line;
      if (!materialOwner.material) return;
      const materials = Array.isArray(materialOwner.material) ? materialOwner.material : [materialOwner.material];
      materials.forEach((material) => {
        expect(material.depthTest).toBe(false);
        expect(material.depthWrite).toBe(false);
        styledParts += 1;
      });
      expect(child.renderOrder).toBeGreaterThanOrEqual(1000);
    });
    expect(styledParts).toBeGreaterThan(0);
  });
});
