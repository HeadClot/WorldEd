import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ManagerProjectedGrid } from '@/viewports/grid/projected/manager_projected_grid.js';
import { buildDefaultPlaneFrame } from '@/navigation/orientation/editor_orientation_basis.js';
import {
  getSharedProjectedGridUniforms,
  resetSharedProjectedGridUniforms,
} from '@/materials/shader/uniform/uniform_projected_grid_shared.js';
import { createContentViewLitMaterial } from '@/materials/factory_content_view_lit_material.js';

describe('ManagerProjectedGrid', () => {
  afterEach(() => {
    ManagerProjectedGrid.dispose();
    resetSharedProjectedGridUniforms();
  });

  it('writes plane frame and cell size into shared content material uniforms', () => {
    const material = createContentViewLitMaterial(0xffffff, null);
    const frame = buildDefaultPlaneFrame();
    frame.origin.set(1, 2, 3);
    ManagerProjectedGrid.setPlaneFrame(frame);
    ManagerProjectedGrid.setCellSize(0.5);
    const origin = material.uniforms['gridOrigin']?.value as THREE.Vector3;
    expect(origin.x).toBeCloseTo(1, 5);
    expect(origin.y).toBeCloseTo(2, 5);
    expect(origin.z).toBeCloseTo(3, 5);
    expect(material.uniforms['cellSize']?.value).toBeCloseTo(0.5, 5);
    material.dispose();
  });

  it('toggles projectedGridEnabled for multi-view prepare passes', () => {
    ManagerProjectedGrid.setVisibleForRenderPass(true);
    expect(ManagerProjectedGrid.isVisible()).toBe(true);
    expect(getSharedProjectedGridUniforms()['projectedGridEnabled']?.value).toBe(1);
    ManagerProjectedGrid.setVisibleForRenderPass(false);
    expect(ManagerProjectedGrid.isVisible()).toBe(false);
    expect(getSharedProjectedGridUniforms()['projectedGridEnabled']?.value).toBe(0);
  });

  it('does not create overlay child meshes on content surfaces', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), createContentViewLitMaterial(0xffffff, null));
    const childCountBefore = mesh.children.length;
    ManagerProjectedGrid.setPlaneFrame(buildDefaultPlaneFrame());
    ManagerProjectedGrid.setVisibleForRenderPass(true);
    expect(mesh.children.length).toBe(childCountBefore);
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  });
});
