import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PreviewGridEdgeAlign } from '@/tools/grid/preview_grid_edge_align.js';
import { computeViewportConstantScreenScale } from '@/viewports/scale/viewport_constant_screen_scale.js';
import { buildDefaultWorldBasis } from '@/navigation/orientation/editor_orientation_edge_align.js';

describe('PreviewGridEdgeAlign', () => {
  it('scales the arrow root with constant on-screen scale while leaving the edge unscaled', () => {
    const scene = new THREE.Scene();
    const preview = new PreviewGridEdgeAlign(scene);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 20);
    const origin = new THREE.Vector3(1, 2, 3);
    const basis = buildDefaultWorldBasis();
    preview.setPreview(origin, basis, new THREE.Vector3(0, 2, 3), new THREE.Vector3(2, 2, 3), 'x', camera);
    const group = scene.getObjectByName('preview_grid_edge_align') as THREE.Group;
    const arrowRoot = scene.getObjectByName('preview_grid_edge_align_arrows') as THREE.Group;
    expect(group).toBeDefined();
    expect(arrowRoot).toBeDefined();
    const expected = computeViewportConstantScreenScale(camera, origin);
    expect(arrowRoot.scale.x).toBeCloseTo(expected);
    expect(group.scale.x).toBeCloseTo(1);

    camera.position.set(0, 0, 40);
    preview.updateScreenScale();
    expect(arrowRoot.scale.x).toBeCloseTo(computeViewportConstantScreenScale(camera, origin));
    preview.dispose();
  });
});
