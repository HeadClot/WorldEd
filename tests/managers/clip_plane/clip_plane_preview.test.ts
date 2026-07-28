import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  ClipPlanePreview,
  CLIP_CONSTRUCTION_LINE_USERDATA_KEY,
  CLIP_CUT_EDGE_USERDATA_KEY,
} from '../../../src/managers/clip_plane/clip_plane_preview.js';
import {
  CLIP_HALF_KEEP_USERDATA_KEY,
  CLIP_HALF_DISCARD_USERDATA_KEY,
} from '../../../src/managers/clip_plane/clip_plane_half_preview.js';
import { ClipPlaneTool } from '../../../src/managers/clip_plane/clip_plane_tool.js';
import {
  CLIP_MARKER_HALO_RADIUS,
  getClipPointColor,
} from '../../../src/managers/clip_plane/clip_plane_marker_style.js';
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

  it('should use distinct RGB colors for the three placement points', () => {
    expect(getClipPointColor(0)).toBe(Theme.clipPoint1Color);
    expect(getClipPointColor(1)).toBe(Theme.clipPoint2Color);
    expect(getClipPointColor(2)).toBe(Theme.clipPoint3Color);
    expect(getClipPointColor(0)).not.toBe(getClipPointColor(1));
    expect(getClipPointColor(1)).not.toBe(getClipPointColor(2));
  });

  it('should color the first marker with point-1 red', () => {
    tool.activate();
    tool.addPoint(new THREE.Vector3(0, 0, 0));
    preview.syncFromTool(tool);
    const colors = collectMarkerCoreColors(preview);
    expect(colors).toContain(Theme.clipPoint1Color);
  });

  it('should create marker groups when the tool has points', () => {
    tool.activate();
    tool.addPoint(new THREE.Vector3(0, 0, 0));
    tool.addPoint(new THREE.Vector3(1, 0, 0));
    preview.syncFromTool(tool);
    const markerGroups = preview.getRoot().children.filter((child) => child instanceof THREE.Group);
    expect(markerGroups.length).toBe(2);
  });

  it('should draw a short construction polyline between points only', () => {
    tool.activate();
    tool.addPoint(new THREE.Vector3(0, 0, 0));
    tool.addPoint(new THREE.Vector3(2, 0, 0));
    preview.syncFromTool(tool);
    const construction = preview
      .getRoot()
      .children.find((child) => child.userData[CLIP_CONSTRUCTION_LINE_USERDATA_KEY]);
    expect(construction).toBeInstanceOf(THREE.Line);
    expect(construction).not.toBeInstanceOf(THREE.LineSegments);
    const material = (construction as THREE.Line).material as THREE.LineBasicMaterial;
    expect(material.depthTest).toBe(false);
    expect(material.color.getHex()).toBe(Theme.clipConstructionLineColor);
  });

  it('should not draw an infinite yellow guide line', () => {
    tool.activate();
    tool.addPoint(new THREE.Vector3(0, 0, 0));
    tool.addPoint(new THREE.Vector3(2, 0, 0));
    preview.syncFromTool(tool);
    const yellowGuides = preview.getRoot().children.filter((child) => {
      if (!(child instanceof THREE.LineSegments)) return false;
      const material = child.material as THREE.LineBasicMaterial;
      return material.color.getHex() === 0xffdd22;
    });
    expect(yellowGuides).toHaveLength(0);
  });

  it('should draw cut silhouette and keep/discard halves without hiding the target', () => {
    tool.activate();
    tool.addPoint(new THREE.Vector3(0, -1, 0));
    tool.addPoint(new THREE.Vector3(0, 1, 0));
    const target = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    target.updateMatrixWorld(true);
    preview.syncFromTool(tool, [target]);
    const cut = preview.getRoot().children.find((child) => child.userData[CLIP_CUT_EDGE_USERDATA_KEY]);
    expect(cut).toBeInstanceOf(THREE.LineSegments);
    const keep = preview.getRoot().children.find((child) => child.userData[CLIP_HALF_KEEP_USERDATA_KEY]);
    const discard = preview.getRoot().children.find((child) => child.userData[CLIP_HALF_DISCARD_USERDATA_KEY]);
    expect(keep).toBeInstanceOf(THREE.Mesh);
    expect(discard).toBeInstanceOf(THREE.Mesh);
    expect(target.visible).toBe(true);
    const keepMaterial = (keep as THREE.Mesh).material as THREE.MeshBasicMaterial;
    const discardMaterial = (discard as THREE.Mesh).material as THREE.MeshBasicMaterial;
    expect(keepMaterial.depthTest).toBe(false);
    expect(discardMaterial.depthTest).toBe(false);
  });

  it('should omit cut silhouette and halves when no targets are supplied', () => {
    tool.activate();
    tool.addPoint(new THREE.Vector3(0, -1, 0));
    tool.addPoint(new THREE.Vector3(0, 1, 0));
    preview.syncFromTool(tool, []);
    const cut = preview.getRoot().children.find((child) => child.userData[CLIP_CUT_EDGE_USERDATA_KEY]);
    const keep = preview.getRoot().children.find((child) => child.userData[CLIP_HALF_KEEP_USERDATA_KEY]);
    expect(cut).toBeUndefined();
    expect(keep).toBeUndefined();
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

  it('should draw a compact keep-side chevron without depth testing', () => {
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
        styledParts += 1;
      });
    });
    expect(styledParts).toBeGreaterThan(0);
  });
});

/**
 * Collects hex colors from solid marker core spheres (skips dark halos).
 *
 * @param preview Clip preview under test.
 * @returns Marker core colors.
 */
function collectMarkerCoreColors(preview: ClipPlanePreview): number[] {
  const colors: number[] = [];
  preview.getRoot().traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const material = child.material as THREE.MeshBasicMaterial;
    if (!material.color) return;
    const hex = material.color.getHex();
    if (hex === 0x0c0e12 || hex === 0xe8eef4) return;
    colors.push(hex);
  });
  return colors;
}
