import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { CommandSolidAddBoxBrush } from '@/solid/commands/command_solid_add_box_brush.js';
import { markAsSolidCsgGroup } from '@/solid/model/solid_group.js';

/** Add-box-brush history must restore ownership and list membership. */
describe('CommandSolidAddBoxBrush', () => {
  it('adds a brush and removes it on undo', () => {
    const model = new SolidModel('AddBrush');
    model.addBoxBrush(2, SolidOperation.Additive);
    const command = new CommandSolidAddBoxBrush(model, 2, SolidOperation.Subtractive, new THREE.Vector3(1, 0, 0));
    command.execute();
    const created = command.getCreatedBrush();
    expect(created).toBeTruthy();
    expect(model.getBrushCount()).toBe(2);
    expect(created!.position.x).toBeCloseTo(1);
    expect(created!.operation).toBe(SolidOperation.Subtractive);
    command.undo();
    expect(model.getBrushCount()).toBe(1);
    expect(model.findBrush(created!.id)).toBeUndefined();
  });

  it('re-inserts the same brush on redo', () => {
    const model = new SolidModel('AddBrushRedo');
    const command = new CommandSolidAddBoxBrush(model, 2, SolidOperation.Additive, new THREE.Vector3());
    command.execute();
    const createdId = command.getCreatedBrush()!.id;
    command.undo();
    command.execute();
    expect(model.findBrush(createdId)).toBeDefined();
    expect(model.getBrushCount()).toBe(1);
  });

  it('appends a new brush under a solid CSG group when parent is supplied', () => {
    const model = new SolidModel('AddNested');
    const rootBrush = model.addBoxBrush(4, SolidOperation.Additive);
    const nested = model.addBoxBrush(2, SolidOperation.Subtractive);
    const group = new THREE.Group();
    group.name = 'Compound';
    markAsSolidCsgGroup(group);
    model.root.add(group);
    group.add(nested.mesh!);
    model.syncBrushOrderFromScene();
    model.rebuild(true);
    const command = new CommandSolidAddBoxBrush(model, 2, SolidOperation.Additive, new THREE.Vector3(0, 0, 0), group);
    command.execute();
    const created = command.getCreatedBrush();
    expect(created?.mesh?.parent).toBe(group);
    expect(group.children.indexOf(created!.mesh!)).toBeGreaterThan(group.children.indexOf(nested.mesh!));
    expect(model.root.children).toContain(rootBrush.mesh!);
    expect(model.root.children).not.toContain(created!.mesh!);
    command.undo();
    expect(created!.mesh!.parent).toBeNull();
    command.execute();
    expect(created!.mesh!.parent).toBe(group);
  });

  it('adds a distant brush with a partial CSG update, not a full map recompile', () => {
    const model = new SolidModel('AddPartial');
    const spacing = 20;
    for (let index = 0; index < 24; index++) {
      const brush = model.addBoxBrush(2, SolidOperation.Additive, null, false);
      brush.position.set(index * spacing, 0, 0);
      brush.pushTransformToMesh();
    }
    model.markDirty();
    model.rebuild(true);
    const command = new CommandSolidAddBoxBrush(
      model,
      2,
      SolidOperation.Additive,
      new THREE.Vector3(24 * spacing, 0, 0),
    );
    command.execute();
    const stats = model.getCompilerStatsForTesting();
    expect(stats.fullRebuild).toBe(false);
    expect(stats.recompiledBrushCount).toBeLessThan(stats.preparedBrushCount);
    expect(stats.recompiledBrushCount).toBeLessThanOrEqual(4);
    expect(command.getCreatedBrush()?.position.x).toBeCloseTo(24 * spacing, 5);
  });
});
