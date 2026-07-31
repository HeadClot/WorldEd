import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { CommandObjectVisibilityToggle } from '@/outliner/commands/command_object_visibility_toggle.js';
import { SolidUpdateSetBuilder } from '@/solid/algorithm/compile/solid_update_set.js';
import { BrushMembership } from '@/solid/algorithm/spatial/brush_membership.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';

/**
 * Samples whether a model-space point is inside the solid via brush ops.
 *
 * @param point Sample point.
 * @param brushes Visible brush instances only.
 * @returns True when inside the evaluated solid.
 */
function isInsideFromBrushes(point: THREE.Vector3, brushes: SolidBrushInstance[]): boolean {
  let inside = false;
  for (const instance of brushes) {
    if (!instance.visible) continue;
    const modelBrush = instance.getModelSpaceBrush();
    const inBrush = BrushMembership.isInsidePlanes(point, modelBrush.planes);
    if (instance.operation === SolidOperation.Additive) {
      inside = inside || inBrush;
    } else if (instance.operation === SolidOperation.Subtractive) {
      inside = inside && !inBrush;
    } else {
      inside = inside && inBrush;
    }
  }
  return inside;
}

/** Unit tests for solid brush visibility excluding brushes from CSG. */
describe('Solid brush visibility CSG', () => {
  it('hides a brush from CSG when the eye toggles visibility off', () => {
    const model = new SolidModel('VisSolid');
    const outer = model.addBoxBrush(4, SolidOperation.Additive);
    const cutter = model.addBoxBrush(2, SolidOperation.Subtractive);
    expect(outer.mesh && cutter.mesh).toBeTruthy();
    const center = new THREE.Vector3(0, 0, 0);
    expect(isInsideFromBrushes(center, model.getBrushes())).toBe(false);
    const beforeHide = model.getResultMesh().geometry.getAttribute('position').count;
    expect(beforeHide).toBeGreaterThan(0);

    cutter.mesh!.visible = false;
    const changed = model.applyBrushVisibilityChange(cutter.mesh!);
    expect(changed).toBe(true);
    expect(cutter.visible).toBe(false);
    expect(isInsideFromBrushes(center, model.getBrushes())).toBe(true);
    const afterHide = model.getResultMesh().geometry.getAttribute('position').count;
    expect(afterHide).toBeGreaterThan(0);
    expect(afterHide).not.toBe(beforeHide);
  });

  it('reincludes a brush in CSG when visibility is restored', () => {
    const model = new SolidModel('VisRestore');
    model.addBoxBrush(4, SolidOperation.Additive);
    const cutter = model.addBoxBrush(2, SolidOperation.Subtractive);
    cutter.mesh!.visible = false;
    model.applyBrushVisibilityChange(cutter.mesh!);
    expect(isInsideFromBrushes(new THREE.Vector3(0, 0, 0), model.getBrushes())).toBe(true);

    cutter.mesh!.visible = true;
    model.applyBrushVisibilityChange(cutter.mesh!);
    expect(cutter.visible).toBe(true);
    expect(isInsideFromBrushes(new THREE.Vector3(0, 0, 0), model.getBrushes())).toBe(false);
  });

  it('toggle visibility command rebuilds solid CSG on execute and undo', () => {
    const model = new SolidModel('VisCommand');
    model.addBoxBrush(4, SolidOperation.Additive);
    const cutter = model.addBoxBrush(2, SolidOperation.Subtractive);
    expect(cutter.mesh).toBeTruthy();
    const command = new CommandObjectVisibilityToggle(cutter.mesh!);
    command.execute();
    expect(cutter.mesh!.visible).toBe(false);
    expect(cutter.visible).toBe(false);
    expect(isInsideFromBrushes(new THREE.Vector3(0, 0, 0), model.getBrushes())).toBe(true);
    command.undo();
    expect(cutter.mesh!.visible).toBe(true);
    expect(cutter.visible).toBe(true);
    expect(isInsideFromBrushes(new THREE.Vector3(0, 0, 0), model.getBrushes())).toBe(false);
  });

  it('expands previous peers for seeds no longer in the prepared list', () => {
    const updateSet = SolidUpdateSetBuilder.build(
      new Set(['hidden']),
      ['a', 'b'],
      new Map([
        ['a', []],
        ['b', []],
      ]),
      new Map([
        ['hidden', ['a', 'b']],
        ['a', ['hidden']],
        ['b', ['hidden']],
      ]),
    );
    expect(updateSet.has('a')).toBe(true);
    expect(updateSet.has('b')).toBe(true);
    expect(updateSet.has('hidden')).toBe(false);
  });
});
