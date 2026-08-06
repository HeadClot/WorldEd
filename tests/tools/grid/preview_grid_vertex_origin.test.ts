import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PreviewGridVertexOrigin } from '@/tools/grid/preview_grid_vertex_origin.js';
import { EDIT_CAGE_VERTEX_POINT_SIZE } from '@/edit/component/component_edit_cage_overlay.js';
import { EDIT_SELECTED_VERTEX_COLOR } from '@/edit/component/component_edit_selection_draw.js';

describe('PreviewGridVertexOrigin', () => {
  it('uses Edit Mode selected-vertex size and white color for the hover marker', () => {
    const scene = new THREE.Scene();
    const preview = new PreviewGridVertexOrigin(scene);
    preview.setHoverPoint(new THREE.Vector3(1, 2, 3));
    const marker = scene.getObjectByName('preview_grid_vertex_origin');
    expect(marker).toBeInstanceOf(THREE.Points);
    const material = (marker as THREE.Points).material as THREE.PointsMaterial;
    expect(material.size).toBe(EDIT_CAGE_VERTEX_POINT_SIZE);
    expect(material.sizeAttenuation).toBe(false);
    expect(material.color.getHex()).toBe(EDIT_SELECTED_VERTEX_COLOR);
    preview.dispose();
  });
});
