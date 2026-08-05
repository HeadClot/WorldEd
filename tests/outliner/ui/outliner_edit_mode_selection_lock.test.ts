import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { PanelOutliner } from '@/outliner/ui/panel_outliner.js';

describe('Outliner Edit Mode selection lock', () => {
  let container: HTMLElement;
  let selectionManager: ManagerSelection;
  let root: THREE.Group;
  let panel: PanelOutliner;
  let meshA: THREE.Mesh;
  let meshB: THREE.Mesh;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    selectionManager = new ManagerSelection();
    root = new THREE.Group();
    meshA = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    meshA.name = 'CubeA';
    meshB = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    meshB.name = 'CubeB';
    root.add(meshA);
    root.add(meshB);
    panel = new PanelOutliner(container, selectionManager, root);
    panel.refresh();
    selectionManager.selectObject(meshA);
    panel.refresh();
  });

  afterEach(() => {
    panel.dispose();
    selectionManager.dispose();
    container.remove();
  });

  it('blocks selecting another object while the selection manager lock is active', () => {
    const blocked = vi.fn();
    selectionManager.setSelectionChangeLockGuard(() => true, blocked);
    clickOutlinerRowByName(container, 'CubeB');
    expect(selectionManager.isObjectSelected(meshA)).toBe(true);
    expect(selectionManager.isObjectSelected(meshB)).toBe(false);
    expect(blocked).toHaveBeenCalledTimes(1);
  });

  it('allows selection changes when the selection manager lock is inactive', () => {
    selectionManager.setSelectionChangeLockGuard(() => false);
    clickOutlinerRowByName(container, 'CubeB');
    expect(selectionManager.isObjectSelected(meshB)).toBe(true);
  });
});

/**
 * Clicks the outliner row whose name span matches.
 *
 * @param host Parent element that contains the outliner panel DOM.
 * @param name Object display name.
 */
function clickOutlinerRowByName(host: HTMLElement, name: string): void {
  const spans = host.querySelectorAll('span');
  for (const span of Array.from(spans)) {
    if (span.textContent !== name) {
      continue;
    }
    const row = span.closest('div');
    row?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return;
  }
  throw new Error(`Outliner row not found: ${name}`);
}
