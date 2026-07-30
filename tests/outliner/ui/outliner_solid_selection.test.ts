import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { PanelOutliner } from '@/outliner/ui/panel_outliner.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';

describe('Outliner solid model selection', () => {
  let container: HTMLElement;
  let selectionManager: ManagerSelection;
  let root: THREE.Group;
  let panel: PanelOutliner;
  let model: SolidModel;
  let brushMesh: THREE.Mesh;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    selectionManager = new ManagerSelection();
    root = new THREE.Group();
    model = new SolidModel('SolidOutliner');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    brushMesh = brush.mesh!;
    root.add(model.root);
    panel = new PanelOutliner(container, selectionManager, root);
    panel.refresh();
  });

  afterEach(() => {
    panel.dispose();
    selectionManager.dispose();
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  it('selects only the result proxy when the solid root row is clicked', () => {
    clickOutlinerRowByName(container, 'SolidOutliner');
    expect(selectionManager.getSelectedObjectCount()).toBe(1);
    expect(selectionManager.isObjectSelected(model.getResultMesh())).toBe(true);
    expect(selectionManager.isObjectSelected(brushMesh)).toBe(false);
    expect(selectionManager.getInspectorObjects()).toEqual([model.root]);
  });

  it('does not select brushes when the solid root is selected', () => {
    clickOutlinerRowByName(container, 'SolidOutliner');
    const selected = selectionManager.getAllSelectedObjectsAsArray();
    expect(selected.every((mesh) => !SolidBrushVisual.isBrushObject(mesh))).toBe(true);
  });

  it('keeps the solid root as inspector target after viewport-style result select', () => {
    selectionManager.selectObject(model.getResultMesh());
    expect(selectionManager.getInspectorObjects()).toEqual([model.root]);
  });

  it('still binds the solid root when all brushes are removed', () => {
    const brushId = model.getBrushes()[0]!.id;
    model.removeBrush(brushId);
    panel.refresh();
    clickOutlinerRowByName(container, 'SolidOutliner');
    expect(selectionManager.getInspectorObjects()).toEqual([model.root]);
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
    if (span.textContent === name) {
      const row = span.closest('div');
      row?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return;
    }
  }
  throw new Error(`Outliner row not found: ${name}`);
}
