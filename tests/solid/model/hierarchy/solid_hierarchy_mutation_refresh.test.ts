import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CommandObjectGroup } from '@/outliner/commands/command_object_group.js';
import { markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

/**
 * Builds a solid with many non-overlapping additive boxes under a world root.
 *
 * @param count Brush count.
 * @returns World, model, and brush meshes.
 */
function makeLargeSolid(count: number): {
  world: THREE.Group;
  model: SolidModel;
  meshes: THREE.Mesh[];
} {
  const world = new THREE.Group();
  const model = new SolidModel('HierarchySolid');
  world.add(model.root);
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
  return { world, model, meshes };
}

/**
 * Counts triangles on the compiled solid result mesh.
 *
 * @param model Solid model.
 * @returns Triangle count.
 */
function resultTriangleCountRead(model: SolidModel): number {
  const mesh = model.getResultMesh();
  const index = mesh.geometry.getIndex();
  if (index) {
    return index.count / 3;
  }
  const positions = mesh.geometry.getAttribute('position');
  return positions ? positions.count / 3 : 0;
}

/** Hierarchy edits must not full-rebuild every brush when order is stable. */
describe('solid hierarchy mutation refresh', () => {
  it('groups brushes with partial CSG when evaluation order is unchanged', () => {
    const { model, meshes } = makeLargeSolid(25);
    const members = [meshes[0]!, meshes[1]!];
    const command = new CommandObjectGroup(members, model.root, 'TestGroup');
    command.execute();
    markAsSolidCsgGroup(command.getGroup());
    SolidModel.hierarchyMutationRefreshFromRoots([command.getGroup()]);
    const stats = model.getCompilerStatsForTesting();
    expect(stats.fullRebuild).toBe(false);
    expect(stats.recompiledBrushCount).toBeLessThan(10);
    expect(stats.reusedBrushCount).toBeGreaterThan(15);
  });

  it('does not rebuild an unrelated solid when grouping another', () => {
    const world = new THREE.Group();
    const active = new SolidModel('Active');
    const idle = new SolidModel('Idle');
    world.add(active.root);
    world.add(idle.root);
    const activeBrush = active.addBoxBrush(2, SolidOperation.Additive);
    const idleBrush = idle.addBoxBrush(2, SolidOperation.Additive);
    idleBrush.position.set(10, 0, 0);
    idleBrush.pushTransformToMesh();
    active.rebuild(true);
    idle.rebuild(true);
    const idleTrianglesBefore = resultTriangleCountRead(idle);

    const command = new CommandObjectGroup([activeBrush.mesh!], active.root, 'OnlyActive');
    command.execute();
    markAsSolidCsgGroup(command.getGroup());
    SolidModel.hierarchyMutationRefreshFromRoots([command.getGroup()]);

    expect(resultTriangleCountRead(idle)).toBe(idleTrianglesBefore);
    expect(idle.getBrushCount()).toBe(1);
  });

  it('removeBrush of an isolated compiled brush stays partial', () => {
    const { model, meshes } = makeLargeSolid(20);
    const victimId = model.findBrushByMesh(meshes[0]!)!.id;
    expect(model.removeBrush(victimId)).toBe(true);
    const stats = model.getCompilerStatsForTesting();
    expect(stats.fullRebuild).toBe(false);
    expect(stats.recompiledBrushCount).toBe(0);
  });

  it('reorders a group among many non-touching brushes with partial CSG', () => {
    const { model, meshes } = makeLargeSolid(40);
    const members = [meshes[5]!, meshes[6]!];
    const group = new THREE.Group();
    markAsSolidCsgGroup(group);
    model.root.add(group);
    group.add(members[0]!);
    group.add(members[1]!);
    model.syncBrushOrderFromScene();
    model.markDirty();
    model.rebuild(true);
    const groupIndexBefore = model.root.children.indexOf(group);
    expect(groupIndexBefore).toBeGreaterThanOrEqual(0);
    // Move group to last content sibling under the solid root.
    model.root.remove(group);
    model.root.add(group);
    SolidModel.hierarchyMutationRefreshFromRoots([group]);
    const stats = model.getCompilerStatsForTesting();
    expect(stats.fullRebuild).toBe(false);
    expect(stats.recompiledBrushCount).toBeLessThan(12);
    expect(stats.reusedBrushCount).toBeGreaterThan(25);
  });
});
