import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidCsgCompiler } from '@/solid/algorithm/compile/solid_csg_compiler.js';
import { SolidCsgTree } from '@/solid/algorithm/compile/solid_csg_tree.js';
import { SolidCsgTreeEvaluator } from '@/solid/algorithm/compile/solid_csg_tree_evaluator.js';
import { FactorySolidBrush } from '@/solid/brush/factory_solid_brush.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { BrushMembership } from '@/solid/algorithm/spatial/brush_membership.js';
import { markAsSolidCsgGroup, getSolidGroupOperation, isSolidCsgGroup } from '@/solid/model/solid_group.js';
import { SolidModelCodec } from '@/solid/io/solid_model_codec.js';
import { CommandObjectGroup } from '@/outliner/commands/command_object_group.js';
import { SurfaceTriangulator } from '@/solid/algorithm/surface/surface_triangulator.js';
import type { PreparedBrush } from '@/solid/algorithm/compile/solid_compile_types.js';

/**
 * Builds a box brush instance for compiler-level tests.
 *
 * @param id Brush id.
 * @param size Box edge length.
 * @param operation CSG operation.
 * @param position Optional model-local position.
 * @returns Configured brush instance.
 */
function makeBoxBrush(
  id: string,
  size: number,
  operation: SolidOperation,
  position?: THREE.Vector3,
): SolidBrushInstance {
  const brush = FactorySolidBrush.createCenteredBox(size, size, size);
  const instance = new SolidBrushInstance(id, id, brush, operation);
  if (position) instance.position.copy(position);
  return instance;
}

/**
 * Prepares model-space brush snapshots for hierarchical membership checks.
 *
 * @param model Solid model with scene hierarchy.
 * @returns Prepared brushes in evaluation order.
 */
function prepareVisibleBrushes(model: SolidModel): PreparedBrush[] {
  return model
    .getBrushes()
    .filter((instance) => instance.visible)
    .map((instance) => {
      const brush = instance.getModelSpaceBrush();
      return {
        instance,
        brush,
        bounds: brush.computeLocalBounds(),
        overlappingPeerIndices: [],
        operation: instance.operation,
      };
    });
}

/**
 * Evaluates hierarchical membership for a point against a solid model.
 *
 * @param model Solid model with hierarchy.
 * @param point Sample point in model space.
 * @returns True when the point is inside the final solid.
 */
function evaluateModelMembership(model: SolidModel, point: THREE.Vector3): boolean {
  const prepared = prepareVisibleBrushes(model);
  const tree = SolidCsgTree.fromSceneGraph(model.root, prepared);
  return SolidCsgTreeEvaluator.evaluateMembership(point, prepared, tree, false, (sample, entry) =>
    BrushMembership.isInsidePlanes(sample, entry.brush.planes),
  );
}

/** Hierarchical solid CSG groups act as compound branch operands. */
describe('Solid CSG groups', () => {
  it('syncs brush evaluation order depth-first through nested groups', () => {
    const model = new SolidModel('GroupOrder');
    const first = model.addBoxBrush(2, SolidOperation.Additive);
    const second = model.addBoxBrush(2, SolidOperation.Additive);
    const third = model.addBoxBrush(2, SolidOperation.Subtractive);
    const group = new THREE.Group();
    markAsSolidCsgGroup(group);
    model.root.add(group);
    group.add(second.mesh!);
    group.add(third.mesh!);
    model.syncBrushOrderFromScene();
    expect(model.getBrushes().map((brush) => brush.id)).toEqual([first.id, second.id, third.id]);
  });

  it('does not flatten groups when reordering root-level brushes', () => {
    const model = new SolidModel('KeepGroup');
    const outer = model.addBoxBrush(4, SolidOperation.Additive);
    const a = model.addBoxBrush(1, SolidOperation.Additive);
    const b = model.addBoxBrush(1, SolidOperation.Additive);
    const group = new THREE.Group();
    markAsSolidCsgGroup(group, SolidOperation.Subtractive);
    model.root.add(group);
    group.add(a.mesh!);
    group.add(b.mesh!);
    model.syncBrushOrderFromScene();
    model.moveBrushesToFirst([outer.id]);
    expect(a.mesh!.parent).toBe(group);
    expect(b.mesh!.parent).toBe(group);
    expect(outer.mesh!.parent).toBe(model.root);
  });

  it('subtracts a compound of two additive brushes as one shape', () => {
    const model = new SolidModel('CompoundSubtract');
    model.addBoxBrush(6, SolidOperation.Additive);
    const left = model.addBoxBrush(2, SolidOperation.Additive);
    const right = model.addBoxBrush(2, SolidOperation.Additive);
    left.position.set(-1.25, 0, 0);
    right.position.set(1.25, 0, 0);
    left.pushTransformToMesh();
    right.pushTransformToMesh();
    const group = new THREE.Group();
    markAsSolidCsgGroup(group, SolidOperation.Subtractive);
    model.root.add(group);
    group.add(left.mesh!);
    group.add(right.mesh!);
    model.syncBrushOrderFromScene();
    model.markDirty();
    model.rebuild(true);
    const leftCenter = new THREE.Vector3(-1.25, 0, 0);
    const rightCenter = new THREE.Vector3(1.25, 0, 0);
    const far = new THREE.Vector3(2.6, 0, 0);
    const center = new THREE.Vector3(0, 0, 0);
    expect(evaluateModelMembership(model, leftCenter)).toBe(false);
    expect(evaluateModelMembership(model, rightCenter)).toBe(false);
    expect(evaluateModelMembership(model, far)).toBe(true);
    expect(evaluateModelMembership(model, center)).toBe(true);
    const compiler = new SolidCsgCompiler();
    const polygons = compiler.compile(model.getBrushes(), { forceFull: true, solidRoot: model.root });
    const arrays = SurfaceTriangulator.buildMeshArrays(polygons);
    expect(arrays.triangleCount).toBeGreaterThan(12);
  });

  it('treats subtractive group as A - (B - C) when children have mixed operations', () => {
    const model = new SolidModel('NestedHole');
    model.addBoxBrush(8, SolidOperation.Additive);
    const block = model.addBoxBrush(4, SolidOperation.Additive);
    const hole = model.addBoxBrush(2, SolidOperation.Subtractive);
    const group = new THREE.Group();
    markAsSolidCsgGroup(group, SolidOperation.Subtractive);
    model.root.add(group);
    group.add(block.mesh!);
    group.add(hole.mesh!);
    model.syncBrushOrderFromScene();
    model.markDirty();
    model.rebuild(true);
    const prepared = prepareVisibleBrushes(model);
    const tree = SolidCsgTree.fromSceneGraph(model.root, prepared);
    expect(tree.isFlat).toBe(false);
    expect(tree.roots.length).toBe(2);
    expect(tree.roots[1]!.kind).toBe('branch');
    const branch = tree.roots[1]!;
    if (branch.kind !== 'branch') throw new Error('expected branch');
    expect(branch.operation).toBe(SolidOperation.Subtractive);
    expect(branch.children).toHaveLength(2);
    expect(evaluateModelMembership(model, new THREE.Vector3(0, 0, 0))).toBe(true);
    expect(evaluateModelMembership(model, new THREE.Vector3(1.5, 0, 0))).toBe(false);
    expect(evaluateModelMembership(model, new THREE.Vector3(3.5, 0, 0))).toBe(true);
  });

  it('includes intermediate group transforms in model-space brush geometry', () => {
    const model = new SolidModel('GroupTransform');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const group = new THREE.Group();
    markAsSolidCsgGroup(group);
    group.position.set(5, 0, 0);
    model.root.add(group);
    group.add(brush.mesh!);
    brush.mesh!.position.set(0, 0, 0);
    brush.pushTransformToMesh();
    const modelBrush = brush.getModelSpaceBrush();
    const bounds = modelBrush.computeLocalBounds();
    expect(bounds.min.x).toBeCloseTo(4, 5);
    expect(bounds.max.x).toBeCloseTo(6, 5);
  });

  it('CommandObjectGroup under a solid can host a solid CSG compound', () => {
    const model = new SolidModel('GroupCmd');
    const a = model.addBoxBrush(2, SolidOperation.Additive);
    const b = model.addBoxBrush(2, SolidOperation.Additive);
    const command = new CommandObjectGroup([a.mesh!, b.mesh!], model.root, 'Compound001');
    command.execute();
    const group = command.getGroup();
    markAsSolidCsgGroup(group, SolidOperation.Subtractive);
    expect(isSolidCsgGroup(group)).toBe(true);
    expect(getSolidGroupOperation(group)).toBe(SolidOperation.Subtractive);
    expect(a.mesh!.parent).toBe(group);
    expect(b.mesh!.parent).toBe(group);
  });

  it('serializes and restores hierarchical solid groups with operations', () => {
    const model = new SolidModel('SerializeGroups');
    model.addBoxBrush(6, SolidOperation.Additive);
    const left = model.addBoxBrush(2, SolidOperation.Additive);
    const right = model.addBoxBrush(2, SolidOperation.Additive);
    left.position.set(-1, 0, 0);
    right.position.set(1, 0, 0);
    left.pushTransformToMesh();
    right.pushTransformToMesh();
    const group = new THREE.Group();
    group.name = 'Cutters';
    markAsSolidCsgGroup(group, SolidOperation.Subtractive);
    model.root.add(group);
    group.add(left.mesh!);
    group.add(right.mesh!);
    model.syncBrushOrderFromScene();
    model.rebuild(true);
    const encoded = SolidModelCodec.encode(model);
    expect(encoded.hierarchy).toBeDefined();
    expect(encoded.hierarchy!.some((node) => node.kind === 'group')).toBe(true);
    const restored = SolidModelCodec.decode(encoded, 'Restored');
    const restoredGroups = restored.root.children.filter((child) => isSolidCsgGroup(child));
    expect(restoredGroups.length).toBe(1);
    expect(getSolidGroupOperation(restoredGroups[0]!)).toBe(SolidOperation.Subtractive);
    expect(restored.getBrushCount()).toBe(3);
    restored.rebuild(true);
    expect(restored.getResultMesh().geometry.getAttribute('position').count).toBeGreaterThan(0);
  });

  it('flat models without groups keep existing additive minus subtractive behavior', () => {
    const outer = makeBoxBrush('outer', 4, SolidOperation.Additive);
    const cutter = makeBoxBrush('cutter', 2, SolidOperation.Subtractive);
    const compiler = new SolidCsgCompiler();
    const polygons = compiler.compile([outer, cutter], { forceFull: true });
    expect(polygons.length).toBeGreaterThan(6);
    const prepared: PreparedBrush[] = [outer, cutter].map((instance) => {
      const brush = instance.getModelSpaceBrush();
      return {
        instance,
        brush,
        bounds: brush.computeLocalBounds(),
        overlappingPeerIndices: [],
        operation: instance.operation,
      };
    });
    const tree = SolidCsgTree.fromPreparedFlat(prepared);
    expect(tree.isFlat).toBe(true);
  });
});
