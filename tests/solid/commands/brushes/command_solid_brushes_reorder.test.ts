import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import {
  CommandSolidBrushesReorder,
  reorderSolidContentSiblings,
} from '@/solid/commands/brushes/command_solid_brushes_reorder.js';
import { CommandStack } from '@/commands/command_stack.js';
import { markAsSolidCsgGroup } from '@/solid/model/solid_group.js';

/** Unit tests for sibling-local solid hierarchy reorder (To First / To Last). */
describe('CommandSolidBrushesReorder', () => {
  it('moves a brush to first and restores order on undo', () => {
    const model = new SolidModel('OrderFirst');
    const a = model.addBoxBrush(2, SolidOperation.Additive);
    const b = model.addBoxBrush(2, SolidOperation.Subtractive);
    const c = model.addBoxBrush(2, SolidOperation.Additive);
    expect(model.getBrushes().map((brush) => brush.id)).toEqual([a.id, b.id, c.id]);
    const stack = new CommandStack(8);
    stack.push(new CommandSolidBrushesReorder([c.mesh!], 'first'));
    expect(model.getBrushes().map((brush) => brush.id)).toEqual([c.id, a.id, b.id]);
    stack.undo();
    expect(model.getBrushes().map((brush) => brush.id)).toEqual([a.id, b.id, c.id]);
  });

  it('moves a brush to last and preserves multi-select relative order', () => {
    const model = new SolidModel('OrderLast');
    const a = model.addBoxBrush(2, SolidOperation.Additive);
    const b = model.addBoxBrush(2, SolidOperation.Additive);
    const c = model.addBoxBrush(2, SolidOperation.Subtractive);
    const d = model.addBoxBrush(2, SolidOperation.Additive);
    const stack = new CommandStack(8);
    stack.push(new CommandSolidBrushesReorder([a.mesh!, b.mesh!], 'last'));
    expect(model.getBrushes().map((brush) => brush.id)).toEqual([c.id, d.id, a.id, b.id]);
    stack.undo();
    expect(model.getBrushes().map((brush) => brush.id)).toEqual([a.id, b.id, c.id, d.id]);
  });

  it('reorders with partial CSG when only one brush moves among many', () => {
    const model = new SolidModel('OrderPartial');
    const brushes = [];
    for (let index = 0; index < 12; index++) {
      const brush = model.addBoxBrush(1.5, SolidOperation.Additive, null, false);
      brush.position.set(index * 3, 0, 0);
      brush.pushTransformToMesh();
      brushes.push(brush);
    }
    model.markDirty();
    model.rebuild(true);
    const mover = brushes[3]!;
    const stack = new CommandStack(8);
    stack.push(new CommandSolidBrushesReorder([mover.mesh!], 'last'));
    const order = model.getBrushes().map((brush) => brush.id);
    expect(order[order.length - 1]).toBe(mover.id);
    expect(order).not.toContainEqual(undefined);
    const stats = model.getCompilerStatsForTesting();
    expect(stats.fullRebuild).toBe(false);
    expect(stats.recompiledBrushCount).toBeLessThan(brushes.length);
    expect(model['pipeline'].wasLastResultWritePartialForTesting()).toBe(true);
  });

  it('moves a nested brush to last inside its group without moving the group', () => {
    const model = new SolidModel('NestedLast');
    const before = model.addBoxBrush(4, SolidOperation.Additive);
    const nestedFirst = model.addBoxBrush(2, SolidOperation.Subtractive);
    const nestedSecond = model.addBoxBrush(2, SolidOperation.Additive);
    const after = model.addBoxBrush(2, SolidOperation.Additive);
    const group = new THREE.Group();
    group.name = 'Compound';
    markAsSolidCsgGroup(group);
    model.root.add(group);
    group.add(nestedFirst.mesh!);
    group.add(nestedSecond.mesh!);
    // Layout content under root: before, after, group — then put after after group.
    model.root.remove(after.mesh!);
    model.root.add(after.mesh!);
    model.syncBrushOrderFromScene();
    model.rebuild(true);
    const groupIndexBefore = model.root.children.indexOf(group);
    const beforeIndex = model.root.children.indexOf(before.mesh!);
    const afterIndex = model.root.children.indexOf(after.mesh!);
    expect(beforeIndex).toBeLessThan(groupIndexBefore);
    expect(groupIndexBefore).toBeLessThan(afterIndex);
    expect(group.children.indexOf(nestedFirst.mesh!)).toBeLessThan(group.children.indexOf(nestedSecond.mesh!));
    const stack = new CommandStack(8);
    stack.push(new CommandSolidBrushesReorder([nestedFirst.mesh!], 'last'));
    expect(group.children.indexOf(nestedSecond.mesh!)).toBeLessThan(group.children.indexOf(nestedFirst.mesh!));
    expect(model.root.children.indexOf(group)).toBe(groupIndexBefore);
    expect(model.root.children.indexOf(before.mesh!)).toBeLessThan(model.root.children.indexOf(group));
    expect(model.root.children.indexOf(group)).toBeLessThan(model.root.children.indexOf(after.mesh!));
    stack.undo();
    expect(group.children.indexOf(nestedFirst.mesh!)).toBeLessThan(group.children.indexOf(nestedSecond.mesh!));
    expect(model.root.children.indexOf(group)).toBe(groupIndexBefore);
  });

  it('moves a solid CSG group to last among root content siblings', () => {
    const model = new SolidModel('GroupLast');
    const before = model.addBoxBrush(4, SolidOperation.Additive);
    const nested = model.addBoxBrush(2, SolidOperation.Subtractive);
    const after = model.addBoxBrush(2, SolidOperation.Additive);
    const group = new THREE.Group();
    markAsSolidCsgGroup(group);
    model.root.add(group);
    group.add(nested.mesh!);
    model.root.remove(after.mesh!);
    model.root.add(after.mesh!);
    model.syncBrushOrderFromScene();
    const stack = new CommandStack(8);
    stack.push(new CommandSolidBrushesReorder([group], 'last'));
    const content = model.root.children.filter(
      (child) => child === before.mesh || child === after.mesh || child === group,
    );
    expect(content[content.length - 1]).toBe(group);
    expect(nested.mesh!.parent).toBe(group);
  });

  it('reorders content siblings under a parent without touching non-content', () => {
    const parent = new THREE.Group();
    const result = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    result.name = 'Result';
    const brushA = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    brushA.userData['isSolidBrush'] = true;
    const brushB = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    brushB.userData['isSolidBrush'] = true;
    const batch = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
    parent.add(result);
    parent.add(brushA);
    parent.add(brushB);
    parent.add(batch);
    const changed = reorderSolidContentSiblings(parent, new Set([brushA]), 'last');
    expect(changed).toBe(true);
    expect(parent.children[0]).toBe(result);
    expect(parent.children[1]).toBe(brushB);
    expect(parent.children[2]).toBe(brushA);
    expect(parent.children[3]).toBe(batch);
  });
});
