import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModelController } from '@/solid/controller/solid_model_controller.js';
import { CommandStack } from '@/commands/command_stack.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { markAsSolidCsgGroup } from '@/solid/model/solid_group.js';

/** Panel stand-in for order-reveal tests. */
class MockSolidPanel {
  private model: SolidModel | null = null;

  /** @param model Active solid model. */
  setModel(model: SolidModel | null): void {
    this.model = model;
  }

  /** @returns Active solid model. */
  getModel(): SolidModel | null {
    return this.model;
  }

  /** No-op refresh. */
  refresh(): void {
    return;
  }

  /** @returns Always true. */
  isOpen(): boolean {
    return true;
  }

  /** No-op toggle. */
  toggle(): void {
    return;
  }
}

/** Unit tests for outliner reveal after To First / To Last. */
describe('SolidModelController order reveal', () => {
  it('reveals the last selected brush after To Last', () => {
    const world = new THREE.Group();
    const selection = new ManagerSelection();
    const panel = new MockSolidPanel();
    const controller = new SolidModelController(world, new CommandStack(16), selection, panel as never);
    const model = new SolidModel('OrderReveal');
    world.add(model.root);
    panel.setModel(model);
    const first = model.addBoxBrush(2, SolidOperation.Additive);
    const second = model.addBoxBrush(2, SolidOperation.Additive);
    const third = model.addBoxBrush(2, SolidOperation.Additive);
    selection.setSelection([first.mesh!, second.mesh!], [first.mesh!, second.mesh!]);
    let revealed: THREE.Object3D | null = null;
    controller.setRevealOutlinerObject((object) => {
      revealed = object;
    });
    controller.moveBrushesInOrder([first.mesh!, second.mesh!], 'last');
    expect(revealed).toBe(second.mesh);
    expect(model.getBrushes().map((brush) => brush.id)).toEqual([third.id, first.id, second.id]);
  });

  it('reveals a selected group after To First', () => {
    const world = new THREE.Group();
    const selection = new ManagerSelection();
    const panel = new MockSolidPanel();
    const controller = new SolidModelController(world, new CommandStack(16), selection, panel as never);
    const model = new SolidModel('GroupOrderReveal');
    world.add(model.root);
    panel.setModel(model);
    const before = model.addBoxBrush(2, SolidOperation.Additive);
    const nested = model.addBoxBrush(2, SolidOperation.Subtractive);
    const after = model.addBoxBrush(2, SolidOperation.Additive);
    const group = new THREE.Group();
    markAsSolidCsgGroup(group);
    model.root.add(group);
    group.add(nested.mesh!);
    model.root.remove(after.mesh!);
    model.root.add(after.mesh!);
    model.syncBrushOrderFromScene();
    selection.setSelection([nested.mesh!], [group]);
    let revealed: THREE.Object3D | null = null;
    controller.setRevealOutlinerObject((object) => {
      revealed = object;
    });
    controller.moveBrushesInOrder([group], 'first');
    expect(revealed).toBe(group);
    void before;
  });
});
