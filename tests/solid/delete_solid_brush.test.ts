import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { CommandSolidDeleteBrushes } from '@/solid/commands/command_solid_delete_brushes.js';
import { markAsSolidCsgGroup } from '@/solid/model/solid_group.js';

/** Deleting a brush must drop it from the solid model CSG list and rebuild. */
describe('Delete solid brushes', () => {
  it('removes the brush from the solid model and updates the result mesh', () => {
    const model = new SolidModel('DelSolid');
    const keep = model.addBoxBrush(4, SolidOperation.Additive);
    const remove = model.addBoxBrush(2, SolidOperation.Subtractive);
    remove.mesh!.position.set(0.5, 0, 0);
    remove.pushTransformToMesh();
    model.rebuild(true);
    const beforeCount = model.getResultMesh().geometry.getAttribute('position').count;
    expect(model.getBrushCount()).toBe(2);
    const command = new CommandSolidDeleteBrushes([remove.mesh!]);
    command.execute();
    expect(model.getBrushCount()).toBe(1);
    expect(model.findBrush(remove.id)).toBeUndefined();
    expect(model.findBrush(keep.id)).toBeDefined();
    expect(remove.mesh!.parent).toBeNull();
    const afterCount = model.getResultMesh().geometry.getAttribute('position').count;
    expect(afterCount).not.toBe(beforeCount);
    expect(afterCount).toBeGreaterThan(0);
  });

  it('undo restores the brush into the solid model tree', () => {
    const model = new SolidModel('DelUndo');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const second = model.addBoxBrush(2, SolidOperation.Subtractive);
    const command = new CommandSolidDeleteBrushes([second.mesh!]);
    command.execute();
    expect(model.getBrushCount()).toBe(1);
    command.undo();
    expect(model.getBrushCount()).toBe(2);
    expect(model.findBrush(second.id)).toBeDefined();
    expect(second.mesh!.parent).toBe(model.root);
    expect(model.findBrush(brush.id)).toBeDefined();
  });

  it('undo restores a middle brush at its original CSG list index', () => {
    const model = new SolidModel('DelOrder');
    const first = model.addBoxBrush(4, SolidOperation.Additive);
    const middle = model.addBoxBrush(2, SolidOperation.Subtractive);
    const last = model.addBoxBrush(2, SolidOperation.Intersecting);
    expect(model.getBrushes().map((brush) => brush.id)).toEqual([first.id, middle.id, last.id]);
    const command = new CommandSolidDeleteBrushes([middle.mesh!]);
    command.execute();
    expect(model.getBrushes().map((brush) => brush.id)).toEqual([first.id, last.id]);
    command.undo();
    expect(model.getBrushes().map((brush) => brush.id)).toEqual([first.id, middle.id, last.id]);
    expect(model.getBrushes().map((brush) => brush.operation)).toEqual([
      SolidOperation.Additive,
      SolidOperation.Subtractive,
      SolidOperation.Intersecting,
    ]);
  });

  it('removes a brush nested under a solid CSG group from the scene hierarchy', () => {
    const model = new SolidModel('DelNested');
    const keep = model.addBoxBrush(4, SolidOperation.Additive);
    const nested = model.addBoxBrush(2, SolidOperation.Subtractive);
    const group = new THREE.Group();
    group.name = 'Compound';
    markAsSolidCsgGroup(group);
    model.root.add(group);
    group.add(nested.mesh!);
    model.rebuild(true);
    expect(nested.mesh!.parent).toBe(group);
    const command = new CommandSolidDeleteBrushes([nested.mesh!]);
    command.execute();
    expect(model.getBrushCount()).toBe(1);
    expect(model.findBrush(nested.id)).toBeUndefined();
    expect(model.findBrush(keep.id)).toBeDefined();
    expect(nested.mesh!.parent).toBeNull();
    expect(group.children).not.toContain(nested.mesh!);
    expect(model.root.children).not.toContain(nested.mesh!);
  });

  it('undo restores a nested brush under its original solid CSG group', () => {
    const model = new SolidModel('DelNestedUndo');
    model.addBoxBrush(4, SolidOperation.Additive);
    const nested = model.addBoxBrush(2, SolidOperation.Subtractive);
    const sibling = model.addBoxBrush(2, SolidOperation.Additive);
    const group = new THREE.Group();
    markAsSolidCsgGroup(group);
    model.root.add(group);
    group.add(nested.mesh!);
    group.add(sibling.mesh!);
    model.rebuild(true);
    const command = new CommandSolidDeleteBrushes([nested.mesh!]);
    command.execute();
    expect(nested.mesh!.parent).toBeNull();
    command.undo();
    expect(model.findBrush(nested.id)).toBeDefined();
    expect(nested.mesh!.parent).toBe(group);
    expect(group.children.indexOf(nested.mesh!)).toBeLessThan(group.children.indexOf(sibling.mesh!));
  });

  it('undo of nested delete keeps the group sibling order under the solid root', () => {
    const model = new SolidModel('DelNestedGroupOrder');
    const before = model.addBoxBrush(4, SolidOperation.Additive);
    const nested = model.addBoxBrush(2, SolidOperation.Subtractive);
    const after = model.addBoxBrush(2, SolidOperation.Additive);
    const group = new THREE.Group();
    group.name = 'Compound';
    markAsSolidCsgGroup(group);
    model.root.add(group);
    group.add(nested.mesh!);
    // Layout: result, before, after, group(nested) — then move after after the group.
    model.root.remove(after.mesh!);
    model.root.add(after.mesh!);
    model.rebuild(true);
    const groupIndexBefore = model.root.children.indexOf(group);
    const beforeIndex = model.root.children.indexOf(before.mesh!);
    const afterIndex = model.root.children.indexOf(after.mesh!);
    expect(beforeIndex).toBeLessThan(groupIndexBefore);
    expect(groupIndexBefore).toBeLessThan(afterIndex);
    const command = new CommandSolidDeleteBrushes([nested.mesh!]);
    command.execute();
    command.undo();
    expect(nested.mesh!.parent).toBe(group);
    const groupIndexAfter = model.root.children.indexOf(group);
    expect(model.root.children.indexOf(before.mesh!)).toBeLessThan(groupIndexAfter);
    expect(groupIndexAfter).toBeLessThan(model.root.children.indexOf(after.mesh!));
  });
});
