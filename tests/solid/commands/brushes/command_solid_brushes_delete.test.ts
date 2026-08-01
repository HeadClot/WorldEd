import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CommandSolidBrushesDelete } from '@/solid/commands/brushes/command_solid_brushes_delete.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

/**
 * Builds a solid with a grid of non-overlapping additive boxes and one optional
 * overlapping peer pair for delete-neighbor tests.
 *
 * @param count Total additive brushes on a grid.
 * @returns Model and brush meshes.
 */
function makeGridSolid(count: number): { model: SolidModel; meshes: THREE.Mesh[] } {
  const model = new SolidModel('DeleteSolid');
  const meshes: THREE.Mesh[] = [];
  const columns = Math.ceil(Math.sqrt(count));
  for (let index = 0; index < count; index++) {
    const brush = model.addBoxBrush(2, SolidOperation.Additive, null, false);
    const column = index % columns;
    const row = Math.floor(index / columns);
    brush.position.set(column * 4, 0, row * 4);
    brush.pushTransformToMesh();
    meshes.push(brush.mesh!);
  }
  model.markDirty();
  model.rebuild(true);
  return { model, meshes };
}

/** Delete must use partial CSG (neighbors only), not a full-map force rebuild. */
describe('CommandSolidBrushesDelete partial rebuild', () => {
  it('deletes an isolated brush without full rebuild of a large solid', () => {
    const { model, meshes } = makeGridSolid(36);
    const victim = meshes[0]!;
    const command = new CommandSolidBrushesDelete([victim]);
    command.execute();
    const stats = model.getCompilerStatsForTesting();
    expect(stats.fullRebuild).toBe(false);
    expect(stats.recompiledBrushCount).toBeLessThan(5);
    expect(model.getBrushCount()).toBe(35);
  });

  it('recompiles only former touch peers when deleting a contacting brush', () => {
    const model = new SolidModel('ContactDelete');
    const far = model.addBoxBrush(2, SolidOperation.Additive, null, false);
    far.position.set(40, 0, 0);
    far.pushTransformToMesh();
    const left = model.addBoxBrush(2, SolidOperation.Additive, null, false);
    left.position.set(-0.5, 0, 0);
    left.pushTransformToMesh();
    const right = model.addBoxBrush(2, SolidOperation.Additive, null, false);
    right.position.set(0.5, 0, 0);
    right.pushTransformToMesh();
    model.markDirty();
    model.rebuild(true);

    const command = new CommandSolidBrushesDelete([left.mesh!]);
    command.execute();
    const stats = model.getCompilerStatsForTesting();
    expect(stats.fullRebuild).toBe(false);
    expect(stats.recompiledBrushCount).toBeGreaterThanOrEqual(1);
    expect(model.findBrush(left.id)).toBeUndefined();
    expect(model.findBrush(far.id)).toBeDefined();
    expect(model.findBrush(right.id)).toBeDefined();
  });

  it('restores deleted brushes on undo with partial seeds', () => {
    const { model, meshes } = makeGridSolid(16);
    const victim = meshes[3]!;
    const victimId = model.findBrushByMesh(victim)!.id;
    const command = new CommandSolidBrushesDelete([victim]);
    command.execute();
    command.undo();
    expect(model.findBrush(victimId)).toBeDefined();
    const stats = model.getCompilerStatsForTesting();
    expect(stats.fullRebuild).toBe(false);
  });
});
