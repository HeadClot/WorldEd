import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { rebuildDecorativeEdges, DECORATIVE_EDGE_USERDATA_KEY } from '@/utils/mesh_edge_sync.js';
import { SELECTION_HIGHLIGHT_USERDATA_KEY } from '@/selection/object/selection_highlight.js';
import {
  EDIT_MODE_WIREFRAME_SUPPRESSED_USERDATA_KEY,
  isEditModeWireframeSuppressed,
} from '@/utils/edit_mode_wireframe_suppress.js';
import { EditModeObjectWireframeHide } from '@/edit/session/edit_mode_object_wireframe_hide.js';

describe('EditModeObjectWireframeHide', () => {
  it('hides decorative content edges for domain meshes and restores them', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    rebuildDecorativeEdges(mesh);
    const decorative = mesh.children.find(
      (child) => child.userData[DECORATIVE_EDGE_USERDATA_KEY] === true,
    ) as THREE.Object3D;
    expect(decorative).toBeDefined();
    expect(decorative.visible).toBe(true);
    const hide = new EditModeObjectWireframeHide();
    hide.hideForDomain([{ kind: 'content_mesh', mesh, targetId: mesh.uuid }]);
    expect(decorative.visible).toBe(false);
    expect(isEditModeWireframeSuppressed(decorative)).toBe(true);
    hide.restore();
    expect(decorative.visible).toBe(true);
    expect(isEditModeWireframeSuppressed(decorative)).toBe(false);
    mesh.geometry.dispose();
  });

  it('hides selection outline groups and unmarked line helpers on domain meshes', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const outlineGroup = new THREE.Group();
    outlineGroup.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] = true;
    const outlineLine = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xff0000 }),
    );
    outlineGroup.add(outlineLine);
    mesh.add(outlineGroup);
    const unmarked = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry, 1),
      new THREE.LineBasicMaterial({ color: 0xaaaaaa }),
    );
    mesh.add(unmarked);
    const hide = new EditModeObjectWireframeHide();
    hide.hideForDomain([{ kind: 'content_mesh', mesh, targetId: mesh.uuid }]);
    expect(outlineGroup.visible).toBe(false);
    expect(unmarked.visible).toBe(false);
    expect(outlineGroup.userData[EDIT_MODE_WIREFRAME_SUPPRESSED_USERDATA_KEY]).toBe(true);
    hide.restore();
    expect(outlineGroup.visible).toBe(true);
    expect(unmarked.visible).toBe(true);
    mesh.geometry.dispose();
    unmarked.geometry.dispose();
  });
});
