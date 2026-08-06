import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  applyContentWireframeVisibilityForRenderPass,
  isContentBrushWireframeHelper,
} from '@/viewports/shading/content_wireframe_visibility.js';
import { DECORATIVE_EDGE_USERDATA_KEY } from '@/utils/mesh_edge_sync.js';
import { SOLID_BRUSH_EDGE_USERDATA_KEY } from '@/solid/model/solid_brush_edge_materials.js';
import { SOLID_BRUSH_EDGE_BATCH_USERDATA_KEY } from '@/solid/model/solid_brush_edge_batch.js';
import { EDIT_MODE_WIREFRAME_SUPPRESSED_USERDATA_KEY } from '@/utils/edit_mode_wireframe_suppress.js';

/**
 * Builds a LineSegments helper with the given userData flag.
 *
 * @param flagKey UserData key to set true.
 * @returns Configured line segments object.
 */
function createWireframeHelper(flagKey: string): THREE.LineSegments {
  const lines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff }));
  lines.userData[flagKey] = true;
  lines.visible = true;
  return lines;
}

describe('content_wireframe_visibility', () => {
  it('recognizes decorative, brush, and batch wireframe helpers', () => {
    expect(isContentBrushWireframeHelper(createWireframeHelper(DECORATIVE_EDGE_USERDATA_KEY))).toBe(true);
    expect(isContentBrushWireframeHelper(createWireframeHelper(SOLID_BRUSH_EDGE_USERDATA_KEY))).toBe(true);
    expect(isContentBrushWireframeHelper(createWireframeHelper(SOLID_BRUSH_EDGE_BATCH_USERDATA_KEY))).toBe(true);
    expect(isContentBrushWireframeHelper(new THREE.Mesh())).toBe(false);
  });

  it('hides content and brush wireframes when the pass disables them', () => {
    const root = new THREE.Group();
    const decorative = createWireframeHelper(DECORATIVE_EDGE_USERDATA_KEY);
    const batch = createWireframeHelper(SOLID_BRUSH_EDGE_BATCH_USERDATA_KEY);
    root.add(decorative, batch);
    applyContentWireframeVisibilityForRenderPass(root, false);
    expect(decorative.visible).toBe(false);
    expect(batch.visible).toBe(false);
  });

  it('shows decorative and batch edges when enabled, but keeps edit-mode suppress', () => {
    const root = new THREE.Group();
    const decorative = createWireframeHelper(DECORATIVE_EDGE_USERDATA_KEY);
    const suppressed = createWireframeHelper(SOLID_BRUSH_EDGE_USERDATA_KEY);
    suppressed.userData[EDIT_MODE_WIREFRAME_SUPPRESSED_USERDATA_KEY] = true;
    decorative.visible = false;
    root.add(decorative, suppressed);
    applyContentWireframeVisibilityForRenderPass(root, true);
    expect(decorative.visible).toBe(true);
    expect(suppressed.visible).toBe(false);
  });
});
