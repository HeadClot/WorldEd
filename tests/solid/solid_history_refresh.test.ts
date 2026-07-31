import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { markAsSolidCsgGroup } from '@/solid/model/solid_group.js';

/**
 * Undo/redo must use partial CSG when only transforms changed, not a full
 * force-rebuild of every solid under the world root.
 */
describe('Solid history refresh', () => {
  it('rebuilds only when brush transforms actually changed', () => {
    const world = new THREE.Group();
    const model = new SolidModel('HistorySolid');
    world.add(model.root);
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const mesh = brush.mesh!;
    model.rebuild(true);
    const triangleCountBefore = countResultTriangles(model);

    SolidModel.refreshAfterHistoryChange(world);
    expect(countResultTriangles(model)).toBe(triangleCountBefore);

    mesh.position.x += 3;
    mesh.updateMatrixWorld(true);
    SolidModel.refreshAfterHistoryChange(world);
    expect(brush.position.x).toBeCloseTo(3, 5);
    expect(countResultTriangles(model)).toBeGreaterThan(0);
  });

  it('force-rebuilds when evaluation order changes in the scene graph', () => {
    const world = new THREE.Group();
    const model = new SolidModel('OrderSolid');
    world.add(model.root);
    const first = model.addBoxBrush(2, SolidOperation.Additive);
    const second = model.addBoxBrush(2, SolidOperation.Subtractive);
    second.mesh!.position.set(0.5, 0, 0);
    second.mesh!.updateMatrixWorld(true);
    model.rebuild(true);

    const firstMesh = first.mesh!;
    const secondMesh = second.mesh!;
    model.root.remove(firstMesh);
    model.root.remove(secondMesh);
    model.root.add(secondMesh);
    model.root.add(firstMesh);

    SolidModel.refreshAfterHistoryChange(world);
    const order = model.getBrushes().map((brush) => brush.id);
    expect(order[0]).toBe(second.id);
    expect(order[1]).toBe(first.id);
  });

  it('recompiles result geometry when a solid CSG group pose undoes without brush local change', () => {
    const world = new THREE.Group();
    const model = new SolidModel('GroupHistorySolid');
    world.add(model.root);
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const group = new THREE.Group();
    markAsSolidCsgGroup(group);
    model.root.add(group);
    group.add(brush.mesh!);
    model.rebuild(true);
    const centerBefore = sampleResultWorldCenter(model);

    group.position.set(8, 0, 0);
    group.updateMatrixWorld(true);
    model.markBrushesDirty([brush.id]);
    model.rebuild(true);
    expect(sampleResultWorldCenter(model).x).toBeCloseTo(centerBefore.x + 8, 4);

    group.position.set(0, 0, 0);
    group.updateMatrixWorld(true);
    expect(brush.mesh!.position.lengthSq()).toBeCloseTo(0, 8);
    SolidModel.refreshAfterHistoryChange(world);
    expect(sampleResultWorldCenter(model).x).toBeCloseTo(centerBefore.x, 4);
  });
});

/**
 * Counts triangles on the compiled solid result mesh.
 *
 * @param model Solid model.
 * @returns Triangle count.
 */
function countResultTriangles(model: SolidModel): number {
  const mesh = model.getResultMeshForSync();
  const index = mesh.geometry.getIndex();
  if (index) return index.count / 3;
  const positions = mesh.geometry.getAttribute('position');
  return positions ? positions.count / 3 : 0;
}

/**
 * Samples the solid result mesh world-space bounding sphere center.
 *
 * @param model Solid model with compiled result geometry.
 * @returns World center of the result mesh bounds.
 */
function sampleResultWorldCenter(model: SolidModel): THREE.Vector3 {
  const result = model.getResultMesh();
  result.updateMatrixWorld(true);
  result.geometry.computeBoundingSphere();
  const center = result.geometry.boundingSphere!.center.clone();
  return center.applyMatrix4(result.matrixWorld);
}
