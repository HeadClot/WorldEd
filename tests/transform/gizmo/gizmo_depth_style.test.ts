import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  applyGizmoCloneDepthStyle,
  GIZMO_DEPTH_ROLE_USERDATA,
  tagGizmoDepthRole,
} from '@/transform/gizmo/gizmo_depth_style.js';
import { createGizmoFrontMaterial, createGizmoOccludedMesh } from '@/transform/gizmo/gizmo_visual_style.js';
import { GizmoTransform } from '@/transform/gizmo/gizmo_transform.js';
import { TransformMode } from '@/types/transform_mode.js';
import { Theme } from '@/theme.js';

describe('applyGizmoCloneDepthStyle', () => {
  it('disables depth testing and hides ghosts for orthographic always-on-top', () => {
    const root = new THREE.Group();
    const frontMaterial = createGizmoFrontMaterial(0xff0000);
    const front = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), frontMaterial);
    const ghost = createGizmoOccludedMesh(new THREE.BoxGeometry(1, 1, 1), 0xff0000);
    root.add(front, ghost);
    applyGizmoCloneDepthStyle(root, true);
    expect(frontMaterial.depthTest).toBe(false);
    expect(ghost.visible).toBe(false);
    frontMaterial.dispose();
    (ghost.material as THREE.Material).dispose();
  });

  it('restores depth-aware front and occluded materials for perspective', () => {
    const root = new THREE.Group();
    const frontMaterial = createGizmoFrontMaterial(0x00ff00);
    const front = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), frontMaterial);
    const ghost = createGizmoOccludedMesh(new THREE.BoxGeometry(1, 1, 1), 0x00ff00);
    const ghostMaterial = ghost.material as THREE.Material;
    root.add(front, ghost);
    applyGizmoCloneDepthStyle(root, true);
    applyGizmoCloneDepthStyle(root, false);
    expect(frontMaterial.depthTest).toBe(true);
    expect(frontMaterial.depthFunc).toBe(THREE.LessEqualDepth);
    expect(ghostMaterial.depthTest).toBe(true);
    expect(ghostMaterial.depthFunc).toBe(THREE.GreaterDepth);
    expect(ghost.visible).toBe(true);
    expect(frontMaterial.userData[GIZMO_DEPTH_ROLE_USERDATA]).toBe('front');
    frontMaterial.dispose();
    ghostMaterial.dispose();
  });

  it('leaves untagged materials alone', () => {
    const root = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({ depthTest: false });
    tagGizmoDepthRole(material, 'front');
    material.userData[GIZMO_DEPTH_ROLE_USERDATA] = undefined;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    root.add(mesh);
    applyGizmoCloneDepthStyle(root, true);
    expect(material.depthTest).toBe(false);
    material.dispose();
  });

  it('applies always-on-top when preparing an orthographic translate clone', () => {
    const gizmo = new GizmoTransform(Theme);
    gizmo.setMode(TransformMode.TRANSLATE);
    gizmo.setVisible(true);
    const clone = gizmo.getHandleGroupClone('xz');
    const ortho = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 1000);
    gizmo.prepareTransformCloneForCamera(clone, ortho);
    let sawFrontWithoutDepth = false;
    let anyGhostVisible = false;
    clone.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (child.userData['isGizmoOccludedGhost'] === true) {
        if (child.visible) anyGhostVisible = true;
        return;
      }
      const material = child.material as THREE.Material;
      if (material.userData[GIZMO_DEPTH_ROLE_USERDATA] === 'front' && material.depthTest === false) {
        sawFrontWithoutDepth = true;
      }
    });
    expect(sawFrontWithoutDepth).toBe(true);
    expect(anyGhostVisible).toBe(false);
    gizmo.dispose();
  });
});
