import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { PanelOutliner } from '@/outliner/ui/panel_outliner.js';
import { ControllerFaceExtrusion } from '@/tools/face/controller_face_extrusion.js';
import { CommandStack } from '@/commands/command_stack.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { SelectionMode } from '@/types/selection_mode.js';

describe('Outliner face mode selection', () => {
  let container: HTMLElement;
  let selectionManager: ManagerSelection;
  let root: THREE.Group;
  let panel: PanelOutliner;
  let faceController: ControllerFaceExtrusion;
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
    faceController = new ControllerFaceExtrusion(new THREE.Scene(), new CommandStack(16), new GridSnap(false, 1), root);
    faceController.setSelectionMode(SelectionMode.FACE);
    panel.setFaceModeSelectionHandler((hierarchyObject, isShiftPressed, isCtrlPressed) =>
      faceController.applyOutlinerHierarchyFaceSelection(hierarchyObject, isShiftPressed, isCtrlPressed),
    );
    panel.refresh();
  });

  afterEach(() => {
    faceController.dispose();
    panel.dispose();
    selectionManager.dispose();
    container.remove();
  });

  it('selects all faces of a mesh without object-selecting', () => {
    clickOutlinerRowByName(container, 'CubeA');
    expect(selectionManager.getSelectedObjectCount()).toBe(0);
    expect(faceController.getSelectedFaceCount()).toBe(12);
    expect(faceController.getSelectedFaces().every((face) => face.mesh === meshA)).toBe(true);
  });

  it('adds faces from a second mesh with Shift', () => {
    clickOutlinerRowByName(container, 'CubeA');
    clickOutlinerRowByName(container, 'CubeB', { shiftKey: true });
    expect(selectionManager.getSelectedObjectCount()).toBe(0);
    expect(faceController.getSelectedFaceCount()).toBe(24);
  });

  it('removes faces from a mesh with Ctrl', () => {
    clickOutlinerRowByName(container, 'CubeA');
    clickOutlinerRowByName(container, 'CubeB', { shiftKey: true });
    clickOutlinerRowByName(container, 'CubeA', { ctrlKey: true });
    expect(faceController.getSelectedFaceCount()).toBe(12);
    expect(faceController.getSelectedFaces().every((face) => face.mesh === meshB)).toBe(true);
  });

  it('replaces face selection on plain click', () => {
    clickOutlinerRowByName(container, 'CubeA');
    clickOutlinerRowByName(container, 'CubeB');
    expect(faceController.getSelectedFaceCount()).toBe(12);
    expect(faceController.getSelectedFaces().every((face) => face.mesh === meshB)).toBe(true);
  });

  it('falls through to object selection when face mode is inactive', () => {
    faceController.setSelectionMode(SelectionMode.OBJECT);
    clickOutlinerRowByName(container, 'CubeA');
    expect(selectionManager.isObjectSelected(meshA)).toBe(true);
    expect(faceController.getSelectedFaceCount()).toBe(0);
  });

  it('does not object-select when handler returns true', () => {
    const handler = vi.fn().mockReturnValue(true);
    panel.setFaceModeSelectionHandler(handler);
    clickOutlinerRowByName(container, 'CubeA', { shiftKey: true });
    expect(handler).toHaveBeenCalledWith(meshA, true, false);
    expect(selectionManager.getSelectedObjectCount()).toBe(0);
  });
});

/**
 * Clicks the outliner row whose name span matches.
 *
 * @param host Parent element that contains the outliner panel DOM.
 * @param name Object display name.
 * @param modifiers Optional Shift/Ctrl flags.
 */
function clickOutlinerRowByName(
  host: HTMLElement,
  name: string,
  modifiers: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean } = {},
): void {
  const spans = host.querySelectorAll('span');
  for (const span of Array.from(spans)) {
    if (span.textContent !== name) {
      continue;
    }
    const row = span.closest('div');
    row?.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        shiftKey: modifiers.shiftKey === true,
        ctrlKey: modifiers.ctrlKey === true,
        metaKey: modifiers.metaKey === true,
      }),
    );
    return;
  }
  throw new Error(`Outliner row not found: ${name}`);
}
