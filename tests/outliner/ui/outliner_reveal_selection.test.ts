import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { OutlinerTree } from '@/outliner/ui/outliner_tree.js';
import { PanelOutliner } from '@/outliner/ui/panel_outliner.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

/** Unit tests for expanding ancestors and scrolling to scene selection. */
describe('Outliner reveal selection', () => {
  let container: HTMLElement;
  let root: THREE.Group;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = new THREE.Group();
    root.name = 'World';
  });

  afterEach(() => {
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  it('expands nested groups so a deep mesh row exists', () => {
    const outer = new THREE.Group();
    outer.name = 'Outer';
    const inner = new THREE.Group();
    inner.name = 'Inner';
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.name = 'DeepCube';
    inner.add(mesh);
    outer.add(inner);
    root.add(outer);
    const tree = new OutlinerTree(container, root);
    tree.refresh(new Set());
    // Groups default to expanded on first paint; deep mesh is already listed.
    const treeElement = container.children[1] as HTMLElement;
    expect(treeElement.textContent).toContain('DeepCube');
    expect(treeElement.textContent).toContain('Outer');
    expect(treeElement.textContent).toContain('Inner');
    tree.dispose();
  });

  it('reveals a solid brush under a collapsed solid model group', () => {
    const selectionManager = new ManagerSelection();
    const panel = new PanelOutliner(container, selectionManager, root);
    const model = new SolidModel('RevealSolid');
    root.add(model.root);
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    expect(brush.mesh).toBeTruthy();
    panel.refresh();
    selectionManager.selectObject(brush.mesh!);
    expect(container.textContent).toContain(brush.name);
    expect(container.textContent).toContain(model.root.name);
    panel.dispose();
  });

  it('tracks last selected mesh for multi-select reveal focus', () => {
    const selectionManager = new ManagerSelection();
    const a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    selectionManager.selectObject(a);
    expect(selectionManager.getLastSelectedObject()).toBe(a);
    selectionManager.addToSelection(b);
    expect(selectionManager.getLastSelectedObject()).toBe(b);
    selectionManager.toggleSelection(b);
    expect(selectionManager.getLastSelectedObject()).toBe(a);
  });

  it('does not expand a closed group when selection uses the group as inspector root', () => {
    const selectionManager = new ManagerSelection();
    const panel = new PanelOutliner(container, selectionManager, root);
    const group = new THREE.Group();
    group.name = 'ClosedGroup';
    const child = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    child.name = 'ChildBrush';
    group.add(child);
    root.add(group);
    panel.refresh();
    const tree = (panel as unknown as { tree: OutlinerTree | null }).tree;
    expect(tree).toBeTruthy();
    tree!.toggleExpand(group);
    expect(tree!.isExpandedUuid(group.uuid)).toBe(false);
    // Duplicate-style selection: child meshes + group as inspector focus.
    selectionManager.setSelection([child], [group]);
    expect(tree!.isExpandedUuid(group.uuid)).toBe(false);
    panel.dispose();
  });
});
