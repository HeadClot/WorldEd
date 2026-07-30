import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { SolidBrushEdgeFader } from '@/solid/model/solid_brush_edge_fader.js';
import {
  BRUSH_EDGE_FADE_FAR,
  SOLID_BRUSH_EDGE_USERDATA_KEY,
  SolidBrushEdgeMaterials,
} from '@/solid/model/solid_brush_edge_materials.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

/** Unit tests for perspective brush edge distance culling. */
describe('SolidBrushEdgeFader', () => {
  it('hides edge lines for brushes beyond the fade distance', () => {
    const root = new THREE.Group();
    const brush = SolidBrushVisual.createBoxPreview('Far', 2, SolidOperation.Additive);
    brush.position.set(0, 0, BRUSH_EDGE_FADE_FAR + 40);
    root.add(brush);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 0);
    SolidBrushEdgeFader.updateForCamera(root, camera);
    const edges = collectEdges(brush);
    expect(edges.length).toBe(1);
    edges.forEach((edge) => expect(edge.visible).toBe(false));
  });

  it('shows edge lines for nearby brushes only', () => {
    const root = new THREE.Group();
    const nearBrush = SolidBrushVisual.createBoxPreview('Near', 2, SolidOperation.Additive);
    nearBrush.position.set(0, 0, 10);
    root.add(nearBrush);
    const farBrush = SolidBrushVisual.createBoxPreview('Far', 2, SolidOperation.Subtractive);
    farBrush.position.set(0, 0, BRUSH_EDGE_FADE_FAR + 40);
    root.add(farBrush);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 0);
    SolidBrushEdgeFader.updateForCamera(root, camera);
    expect(findFrontEdge(nearBrush).visible).toBe(true);
    expect(findFrontEdge(farBrush).visible).toBe(false);
  });

  it('keeps selected brush edges visible farther than unselected ones', () => {
    const root = new THREE.Group();
    const brush = SolidBrushVisual.createBoxPreview('Selected', 2, SolidOperation.Additive);
    const distance = BRUSH_EDGE_FADE_FAR + 20;
    brush.position.set(0, 0, distance);
    root.add(brush);
    SolidBrushVisual.setHullFillVisible(brush, true);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 0);
    SolidBrushEdgeFader.updateForCamera(root, camera);
    expect(findFrontEdge(brush).visible).toBe(true);
  });

  it('restores all brush edges after a perspective distance cull', () => {
    const root = new THREE.Group();
    const brush = SolidBrushVisual.createBoxPreview('Far', 2, SolidOperation.Additive);
    brush.position.set(0, 0, BRUSH_EDGE_FADE_FAR + 40);
    root.add(brush);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 0);
    SolidBrushEdgeFader.updateForCamera(root, camera);
    collectEdges(brush).forEach((edge) => expect(edge.visible).toBe(false));
    SolidBrushEdgeFader.showAllEdges(root);
    collectEdges(brush).forEach((edge) => expect(edge.visible).toBe(true));
  });

  it('prepares orthographic passes with full-bright edges (no depth test)', () => {
    const root = new THREE.Group();
    const brush = SolidBrushVisual.createBoxPreview('Sky', 2, SolidOperation.Additive);
    brush.position.set(0, 50, 0);
    root.add(brush);
    SolidBrushEdgeMaterials.setDepthOcclusionEnabled(true);
    SolidBrushEdgeFader.invalidateCameraCache();
    SolidBrushEdgeFader.prepareForOrthographicPass(root);
    expect(SolidBrushEdgeMaterials.isDepthOcclusionEnabled()).toBe(false);
    expect(findFrontEdge(brush).visible).toBe(true);
    expect(SolidBrushEdgeMaterials.getFrontMaterial(SolidOperation.Additive).depthTest).toBe(false);
    SolidBrushEdgeFader.prepareForPerspectivePass(root);
    expect(SolidBrushEdgeMaterials.isDepthOcclusionEnabled()).toBe(true);
    expect(SolidBrushEdgeMaterials.getFrontMaterial(SolidOperation.Additive).depthTest).toBe(true);
  });

  it('skips redundant full brush walks for consecutive orthographic multi-view panes', () => {
    const root = new THREE.Group();
    const brush = SolidBrushVisual.createBoxPreview('Near', 2, SolidOperation.Additive);
    brush.position.set(0, 0, BRUSH_EDGE_FADE_FAR + 40);
    root.add(brush);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 0);
    SolidBrushEdgeFader.invalidateCameraCache();
    SolidBrushEdgeFader.updateForCamera(root, camera);
    expect(findFrontEdge(brush).visible).toBe(false);
    SolidBrushEdgeFader.prepareForOrthographicPass(root);
    expect(findFrontEdge(brush).visible).toBe(true);
    findFrontEdge(brush).visible = false;
    SolidBrushEdgeFader.prepareForOrthographicPass(root);
    // Second ortho pass must not re-walk; the forced false stays.
    expect(findFrontEdge(brush).visible).toBe(false);
    SolidBrushEdgeFader.invalidateCameraCache();
    SolidBrushEdgeFader.prepareForOrthographicPass(root);
    expect(findFrontEdge(brush).visible).toBe(true);
  });

  it('disables selected hull fill depth occlusion for orthographic multi-view passes', () => {
    const root = new THREE.Group();
    const brush = SolidBrushVisual.createBoxPreview('Selected', 2, SolidOperation.Additive);
    root.add(brush);
    SolidBrushVisual.setHullFillVisible(brush, true);
    SolidBrushEdgeFader.prepareForPerspectivePass(root);
    const material = brush.material as THREE.MeshBasicMaterial;
    expect(material.depthTest).toBe(true);
    expect(SolidBrushVisual.isHullFillDepthOcclusionEnabled()).toBe(true);
    SolidBrushEdgeFader.prepareForOrthographicPass(root);
    expect(SolidBrushVisual.isHullFillDepthOcclusionEnabled()).toBe(false);
    expect(material.depthTest).toBe(false);
    expect(material.depthFunc).toBe(THREE.AlwaysDepth);
    expect(brush.renderOrder).toBeGreaterThan(2);
    SolidBrushEdgeFader.prepareForPerspectivePass(root);
    expect(material.depthTest).toBe(true);
    expect(material.depthFunc).toBe(THREE.LessEqualDepth);
    expect(brush.renderOrder).toBe(2);
  });
});

/**
 * Collects decorative edge line children of a brush mesh.
 *
 * @param mesh Brush preview mesh.
 * @returns Edge line segments.
 */
function collectEdges(mesh: THREE.Mesh): THREE.LineSegments[] {
  return mesh.children.filter(
    (child): child is THREE.LineSegments =>
      child instanceof THREE.LineSegments && child.userData[SOLID_BRUSH_EDGE_USERDATA_KEY] === true,
  );
}

/**
 * Finds the brush edge LineSegments on a brush.
 *
 * @param mesh Brush preview mesh.
 * @returns Edge line segments.
 */
function findFrontEdge(mesh: THREE.Mesh): THREE.LineSegments {
  const edge = collectEdges(mesh)[0];
  if (!edge) throw new Error('missing brush edge');
  return edge;
}
