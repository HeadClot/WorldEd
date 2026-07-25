import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { SelectionManager } from '../../../src/selection/object/selection_manager.js';
import { SolidModel } from '../../../src/solid/model/solid_model.js';
import { SolidOperation } from '../../../src/solid/types/solid_operation.js';
import { SolidBrushVisual } from '../../../src/solid/model/solid_brush_visual.js';

describe('SelectionManager solid model inspector binding', () => {
  let manager: SelectionManager;
  let model: SolidModel;
  let brushMesh: THREE.Mesh;
  let resultMesh: THREE.Mesh;

  beforeEach(() => {
    manager = new SelectionManager();
    model = new SolidModel('SolidSel');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    brushMesh = brush.mesh!;
    resultMesh = model.getResultMesh();
  });

  it('binds the inspector to the solid root when selecting the result mesh', () => {
    manager.selectObject(resultMesh);
    expect(manager.isObjectSelected(resultMesh)).toBe(true);
    expect(manager.getInspectorObjects()).toEqual([model.root]);
  });

  it('keeps brush selection bound to the brush for the inspector', () => {
    manager.selectObject(brushMesh);
    expect(manager.getInspectorObjects()).toEqual([brushMesh]);
    expect(SolidBrushVisual.isBrushObject(brushMesh)).toBe(true);
  });

  it('accepts solid root as inspector object without selecting brushes', () => {
    manager.setSelection([resultMesh], [model.root]);
    expect(manager.getSelectedObjectCount()).toBe(1);
    expect(manager.isObjectSelected(resultMesh)).toBe(true);
    expect(manager.isObjectSelected(brushMesh)).toBe(false);
    expect(manager.getInspectorObjects()).toEqual([model.root]);
  });

  it('allows empty mesh selection with solid root inspector objects', () => {
    manager.setSelection([], [model.root]);
    expect(manager.getSelectedObjectCount()).toBe(0);
    expect(manager.getInspectorObjects()).toEqual([model.root]);
  });
});
