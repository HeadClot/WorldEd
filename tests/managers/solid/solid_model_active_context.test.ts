import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModelController } from '../../../src/managers/solid/solid_model_controller.js';
import { CommandStack } from '../../../src/commands/command_stack.js';
import { SelectionManager } from '../../../src/selection/object/selection_manager.js';
import { SolidModel } from '../../../src/solid/model/solid_model.js';
import { SolidOperation } from '../../../src/solid/types/solid_operation.js';
import { DeleteSolidBrushesCommand } from '../../../src/commands/solid/delete_solid_brushes_command.js';

/** Lightweight panel stand-in for active-model resolution tests. */
class MockSolidPanel {
  private model: SolidModel | null = null;

  setModel(model: SolidModel | null): void {
    this.model = model;
  }

  getModel(): SolidModel | null {
    return this.model;
  }

  refresh(): void {
    return;
  }

  isOpen(): boolean {
    return true;
  }

  toggle(): void {
    return;
  }
}

/** Unit tests for remembering the active solid model after selection clears. */
describe('Solid model active context', () => {
  it('still adds a box brush after deleting the selected brush', () => {
    const world = new THREE.Group();
    const selection = new SelectionManager();
    const panel = new MockSolidPanel();
    const controller = new SolidModelController(world, new CommandStack(16), selection, panel as never);
    const model = new SolidModel('ActiveCtx');
    world.add(model.root);
    const first = model.addBoxBrush(2, SolidOperation.Additive);
    const second = model.addBoxBrush(2, SolidOperation.Additive);
    selection.selectObject(second.mesh!);
    // Selection change remembers the model via the controller listener.
    expect(panel.getModel()).toBe(model);
    expect(model.getBrushCount()).toBe(2);

    new DeleteSolidBrushesCommand([second.mesh!]).execute();
    selection.clearSelection();
    expect(selection.getSelectedObjects().size).toBe(0);
    expect(model.getBrushCount()).toBe(1);

    controller.addBoxBrush();
    expect(model.getBrushCount()).toBe(2);
    expect(panel.getModel()).toBe(model);
    void first;
  });
});
