import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModelController } from '../../../src/managers/solid/solid_model_controller.js';
import { CommandStack } from '../../../src/commands/command_stack.js';
import { SelectionManager } from '../../../src/selection/object/selection_manager.js';
import { SolidModel } from '../../../src/solid/model/solid_model.js';
import { SolidOperation } from '../../../src/solid/types/solid_operation.js';
import { DeleteSolidBrushesCommand } from '../../../src/commands/solid/delete_solid_brushes_command.js';
import { createDefaultStartupSolidModel } from '../../../src/solid/model/default_startup_solid_model.js';
import { markAsSolidCsgGroup } from '../../../src/solid/model/solid_group.js';

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

  it('adopts a startup solid model already in the world as the active context', () => {
    const world = new THREE.Group();
    const selection = new SelectionManager();
    const panel = new MockSolidPanel();
    const controller = new SolidModelController(world, new CommandStack(16), selection, panel as never);
    const startup = createDefaultStartupSolidModel();
    world.add(startup.root);
    expect(panel.getModel()).toBeNull();
    expect(controller.adoptFirstSolidModelInWorld()).toBe(true);
    expect(panel.getModel()).toBe(startup);
    controller.addBoxBrush();
    expect(startup.getBrushCount()).toBe(2);
  });

  it('adds a box brush under the group that owns the selected brush', () => {
    const world = new THREE.Group();
    const selection = new SelectionManager();
    const panel = new MockSolidPanel();
    const controller = new SolidModelController(world, new CommandStack(16), selection, panel as never);
    const model = new SolidModel('NestedAdd');
    world.add(model.root);
    const rootBrush = model.addBoxBrush(4, SolidOperation.Additive);
    const nested = model.addBoxBrush(2, SolidOperation.Additive);
    const group = new THREE.Group();
    markAsSolidCsgGroup(group);
    model.root.add(group);
    group.add(nested.mesh!);
    model.syncBrushOrderFromScene();
    selection.selectObject(nested.mesh!);
    controller.addBoxBrush();
    expect(model.getBrushCount()).toBe(3);
    const created = model.getBrushes().find((brush) => brush.id !== rootBrush.id && brush.id !== nested.id);
    expect(created?.mesh?.parent).toBe(group);
    expect(group.children[group.children.length - 1]).toBe(created!.mesh!);
  });
});
