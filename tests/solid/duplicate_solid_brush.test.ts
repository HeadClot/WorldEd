import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { CommandSolidDuplicateBrushes } from '@/solid/commands/command_solid_duplicate_brushes.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { isSolidCsgGroup, markAsSolidCsgGroup } from '@/solid/model/solid_group.js';

/** Tests that solid brush duplication stays inside the solid model hierarchy. */
describe('Duplicate solid brushes', () => {
  it('duplicates a brush under the same solid model root', () => {
    const world = new THREE.Group();
    const model = new SolidModel('DupSolid');
    const source = model.addBoxBrush(2, SolidOperation.Additive);
    world.add(model.root);
    expect(source.mesh).toBeTruthy();
    const clone = model.duplicateBrush(source.id);
    expect(clone).toBeTruthy();
    expect(model.getBrushCount()).toBe(2);
    expect(clone!.mesh?.parent).toBe(model.root);
    expect(SolidBrushVisual.isBrushObject(clone!.mesh!)).toBe(true);
    expect(SolidModel.fromObject(clone!.mesh!)).toBe(model);
    expect(clone!.position.x).toBeCloseTo(source.position.x, 5);
    expect(clone!.position.y).toBeCloseTo(source.position.y, 5);
    expect(clone!.position.z).toBeCloseTo(source.position.z, 5);
  });

  it('undoes solid brush duplication via command', () => {
    const model = new SolidModel('CmdSolid');
    const source = model.addBoxBrush(2, SolidOperation.Subtractive);
    const command = new CommandSolidDuplicateBrushes([source.mesh!], new THREE.Vector3(0, 0, 0));
    command.execute();
    expect(model.getBrushCount()).toBe(2);
    expect(command.getClonedMeshes().length).toBe(1);
    command.undo();
    expect(model.getBrushCount()).toBe(1);
    expect(command.getClonedMeshes().length).toBe(0);
  });

  it('duplicates multiple brushes in outliner order, not selection click order', () => {
    const model = new SolidModel('OrderDupSolid');
    const first = model.addBoxBrush(4, SolidOperation.Additive);
    const second = model.addBoxBrush(2, SolidOperation.Subtractive);
    const third = model.addBoxBrush(3, SolidOperation.Additive);
    first.mesh!.name = 'FirstBrush';
    second.mesh!.name = 'SecondBrush';
    third.mesh!.name = 'ThirdBrush';
    const selectionClickOrder = [third.mesh!, first.mesh!];
    const command = new CommandSolidDuplicateBrushes(selectionClickOrder, new THREE.Vector3(0, 0, 0));
    command.execute();
    const brushes = model.getBrushes();
    expect(brushes).toHaveLength(5);
    // Clones insert after each source in scene order: first, first_copy, second, third, third_copy.
    expect(brushes.map((brush) => brush.name)).toEqual([
      'FirstBrush',
      'FirstBrush_copy',
      'SecondBrush',
      'ThirdBrush',
      'ThirdBrush_copy',
    ]);
    expect(brushes.map((brush) => brush.operation)).toEqual([
      SolidOperation.Additive,
      SolidOperation.Additive,
      SolidOperation.Subtractive,
      SolidOperation.Additive,
      SolidOperation.Additive,
    ]);
    const rootBrushMeshes = model.root.children.filter((child) => SolidBrushVisual.isBrushObject(child));
    expect(rootBrushMeshes.map((mesh) => mesh.name)).toEqual([
      'FirstBrush',
      'FirstBrush_copy',
      'SecondBrush',
      'ThirdBrush',
      'ThirdBrush_copy',
    ]);
  });

  it('duplicates a nested brush under the same solid CSG group after the source', () => {
    const model = new SolidModel('DupNested');
    const outer = model.addBoxBrush(4, SolidOperation.Additive);
    const nested = model.addBoxBrush(2, SolidOperation.Subtractive);
    const nestedSibling = model.addBoxBrush(2, SolidOperation.Additive);
    const group = new THREE.Group();
    group.name = 'Compound';
    markAsSolidCsgGroup(group);
    model.root.add(group);
    group.add(nested.mesh!);
    group.add(nestedSibling.mesh!);
    model.syncBrushOrderFromScene();
    model.rebuild(true);
    const clone = model.duplicateBrush(nested.id);
    expect(clone).toBeTruthy();
    expect(clone!.mesh?.parent).toBe(group);
    expect(model.root.children).not.toContain(clone!.mesh!);
    expect(outer.mesh?.parent).toBe(model.root);
    const nestedIndex = group.children.indexOf(nested.mesh!);
    const cloneIndex = group.children.indexOf(clone!.mesh!);
    expect(cloneIndex).toBe(nestedIndex + 1);
    expect(group.children.indexOf(nestedSibling.mesh!)).toBeGreaterThan(cloneIndex);
  });

  it('duplicates a solid CSG group with nested brushes under the solid root', () => {
    const model = new SolidModel('DupGroup');
    model.addBoxBrush(4, SolidOperation.Additive);
    const nestedA = model.addBoxBrush(2, SolidOperation.Subtractive);
    const nestedB = model.addBoxBrush(2, SolidOperation.Additive);
    const group = new THREE.Group();
    group.name = 'Compound';
    markAsSolidCsgGroup(group);
    model.root.add(group);
    group.add(nestedA.mesh!);
    group.add(nestedB.mesh!);
    model.syncBrushOrderFromScene();
    model.rebuild(true);
    const brushCountBefore = model.getBrushCount();
    const command = new CommandSolidDuplicateBrushes([group], new THREE.Vector3(0, 0, 0));
    command.execute();
    expect(model.getBrushCount()).toBe(brushCountBefore + 2);
    const clonedRoots = command.getClonedInspectorRoots();
    expect(clonedRoots).toHaveLength(1);
    const clonedGroup = clonedRoots[0] as THREE.Group;
    expect(isSolidCsgGroup(clonedGroup)).toBe(true);
    expect(clonedGroup.parent).toBe(model.root);
    expect(model.root.children.indexOf(clonedGroup)).toBe(model.root.children.indexOf(group) + 1);
    const clonedBrushes = clonedGroup.children.filter((child) => SolidBrushVisual.isBrushObject(child));
    expect(clonedBrushes).toHaveLength(2);
    expect(command.getClonedMeshes()).toHaveLength(2);
    command.undo();
    expect(model.getBrushCount()).toBe(brushCountBefore);
    expect(clonedGroup.parent).toBeNull();
  });
});
