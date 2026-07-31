import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import { SolidCsgTree } from '@/solid/algorithm/compile/solid_csg_tree.js';
import { SolidCsgTreeEvaluator } from '@/solid/algorithm/compile/solid_csg_tree_evaluator.js';
import { BrushMembership } from '@/solid/algorithm/spatial/brush_membership.js';
import type { PreparedBrush } from '@/solid/algorithm/compile/solid_compile_types.js';
import { CommandSolidGroupOperationSet } from '@/solid/commands/group/command_solid_group_operation_set.js';

/**
 * Prepares model-space brush snapshots for membership checks.
 *
 * @param model Solid model.
 * @returns Prepared brushes.
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
 * Evaluates hierarchical membership for a point.
 *
 * @param model Solid model.
 * @param point Sample point.
 * @returns True when inside the final solid.
 */
function evaluateModelMembership(model: SolidModel, point: THREE.Vector3): boolean {
  const prepared = prepareVisibleBrushes(model);
  const tree = SolidCsgTree.fromSceneGraph(model.root, prepared);
  return SolidCsgTreeEvaluator.evaluateMembership(point, prepared, tree, false, (sample, entry) =>
    BrushMembership.isInsidePlanes(sample, entry.brush.planes),
  );
}

/**
 * Counts result mesh triangles.
 *
 * @param model Solid model.
 * @returns Triangle count.
 */
function resultTriangleCount(model: SolidModel): number {
  const mesh = model.getResultMesh();
  const index = mesh.geometry.getIndex();
  if (index) return index.count / 3;
  const positions = mesh.geometry.getAttribute('position');
  return positions ? positions.count / 3 : 0;
}

describe('Solid CSG single-brush subtractive group', () => {
  it('group operation change to subtractive carves with a single child brush', () => {
    const model = new SolidModel('OpChangeSingle');
    model.addBoxBrush(6, SolidOperation.Additive);
    const cutter = model.addBoxBrush(2, SolidOperation.Additive);
    const group = new THREE.Group();
    markAsSolidCsgGroup(group, SolidOperation.Additive);
    model.root.add(group);
    group.add(cutter.mesh!);
    model.syncBrushOrderFromScene();
    model.markDirty();
    model.rebuild(true);
    const trianglesBefore = resultTriangleCount(model);
    expect(evaluateModelMembership(model, new THREE.Vector3(0, 0, 0))).toBe(true);

    new CommandSolidGroupOperationSet([group], SolidOperation.Subtractive).execute();

    expect(evaluateModelMembership(model, new THREE.Vector3(0, 0, 0))).toBe(false);
    expect(evaluateModelMembership(model, new THREE.Vector3(2.5, 0, 0))).toBe(true);
    expect(resultTriangleCount(model)).toBeGreaterThan(trianglesBefore);
    const stats = model.getCompilerStatsForTesting();
    expect(stats.recompiledBrushCount).toBeGreaterThanOrEqual(2);
  });

  it('user path: create group of one brush then set subtractive (partial rebuild path)', () => {
    const model = new SolidModel('UserPathSingle');
    model.addBoxBrush(6, SolidOperation.Additive);
    const cutter = model.addBoxBrush(2, SolidOperation.Additive);
    model.markDirty();
    model.rebuild(true);
    const outerOnlyTriangles = resultTriangleCount(model);

    const group = new THREE.Group();
    markAsSolidCsgGroup(group, SolidOperation.Additive);
    model.root.add(group);
    group.add(cutter.mesh!);
    model.syncBrushOrderFromScene();
    model.hierarchyMutationRefresh([cutter.id]);
    expect(resultTriangleCount(model)).toBeGreaterThan(0);

    new CommandSolidGroupOperationSet([group], SolidOperation.Subtractive).execute();
    expect(resultTriangleCount(model)).toBeGreaterThan(outerOnlyTriangles);
    expect(evaluateModelMembership(model, new THREE.Vector3(0, 0, 0))).toBe(false);
    const stats = model.getCompilerStatsForTesting();
    expect(stats.fullRebuild).toBe(false);
  });

  it('membership: one additive brush in a subtractive group carves the parent solid', () => {
    const model = new SolidModel('SingleCutterGroup');
    model.addBoxBrush(6, SolidOperation.Additive);
    const cutter = model.addBoxBrush(2, SolidOperation.Additive);
    const group = new THREE.Group();
    markAsSolidCsgGroup(group, SolidOperation.Subtractive);
    model.root.add(group);
    group.add(cutter.mesh!);
    model.syncBrushOrderFromScene();

    const prepared = prepareVisibleBrushes(model);
    const tree = SolidCsgTree.fromSceneGraph(model.root, prepared);
    expect(tree.isFlat).toBe(false);
    expect(tree.roots).toHaveLength(2);
    expect(tree.roots[1]!.kind).toBe('branch');
    if (tree.roots[1]!.kind === 'branch') {
      expect(tree.roots[1]!.children).toHaveLength(1);
      expect(tree.roots[1]!.operation).toBe(SolidOperation.Subtractive);
    }

    expect(evaluateModelMembership(model, new THREE.Vector3(0, 0, 0))).toBe(false);
    expect(evaluateModelMembership(model, new THREE.Vector3(2.5, 0, 0))).toBe(true);
  });

  it('rebuild result: one additive brush in a subtractive group produces a hole', () => {
    const model = new SolidModel('SingleCutterRebuild');
    model.addBoxBrush(6, SolidOperation.Additive);
    const onlyOuter = resultTriangleCountAfterFull(model);
    const cutter = model.addBoxBrush(2, SolidOperation.Additive);
    const group = new THREE.Group();
    markAsSolidCsgGroup(group, SolidOperation.Subtractive);
    model.root.add(group);
    group.add(cutter.mesh!);
    model.syncBrushOrderFromScene();
    model.markDirty();
    model.rebuild(true);
    const withHole = resultTriangleCount(model);
    expect(withHole).toBeGreaterThan(onlyOuter);
    expect(evaluateModelMembership(model, new THREE.Vector3(0, 0, 0))).toBe(false);
  });

  it('matches two-brush compound subtract for a single overlapping cutter volume', () => {
    const single = buildSingleCutterModel();
    const double = buildDoubleCutterModel();
    const sample = new THREE.Vector3(0, 0, 0);
    expect(evaluateModelMembership(single, sample)).toBe(false);
    expect(evaluateModelMembership(double, sample)).toBe(false);
    expect(evaluateModelMembership(single, new THREE.Vector3(2.6, 0, 0))).toBe(true);
    expect(evaluateModelMembership(double, new THREE.Vector3(2.6, 0, 0))).toBe(true);
  });

  it('single additive child of subtractive group matches flat subtractive leaf mesh topology class', () => {
    const hierarchical = buildSingleCutterModel();
    const flat = new SolidModel('FlatLeafSubtract');
    flat.addBoxBrush(6, SolidOperation.Additive);
    const cutter = flat.addBoxBrush(2, SolidOperation.Subtractive);
    void cutter;
    flat.markDirty();
    flat.rebuild(true);
    expect(evaluateModelMembership(hierarchical, new THREE.Vector3(0, 0, 0))).toBe(
      evaluateModelMembership(flat, new THREE.Vector3(0, 0, 0)),
    );
    expect(evaluateModelMembership(hierarchical, new THREE.Vector3(2.5, 0, 0))).toBe(
      evaluateModelMembership(flat, new THREE.Vector3(2.5, 0, 0)),
    );
    const hierTriangles = resultTriangleCount(hierarchical);
    const flatTriangles = resultTriangleCount(flat);
    expect(hierTriangles).toBeGreaterThan(12);
    expect(Math.abs(hierTriangles - flatTriangles)).toBeLessThanOrEqual(2);
  });
});

/**
 * Rebuilds a model with only the outer box and returns its triangle count.
 *
 * @param model Solid model already containing the outer brush.
 * @returns Triangle count after full rebuild.
 */
function resultTriangleCountAfterFull(model: SolidModel): number {
  model.markDirty();
  model.rebuild(true);
  return resultTriangleCount(model);
}

/**
 * Outer additive + one additive cutter in a subtractive group.
 *
 * @returns Configured solid model.
 */
function buildSingleCutterModel(): SolidModel {
  const model = new SolidModel('Single');
  model.addBoxBrush(6, SolidOperation.Additive);
  const cutter = model.addBoxBrush(2, SolidOperation.Additive);
  const group = new THREE.Group();
  markAsSolidCsgGroup(group, SolidOperation.Subtractive);
  model.root.add(group);
  group.add(cutter.mesh!);
  model.syncBrushOrderFromScene();
  model.markDirty();
  model.rebuild(true);
  return model;
}

/**
 * Outer additive + two additive cutters in a subtractive group (known-good
 * case).
 *
 * @returns Configured solid model.
 */
function buildDoubleCutterModel(): SolidModel {
  const model = new SolidModel('Double');
  model.addBoxBrush(6, SolidOperation.Additive);
  const left = model.addBoxBrush(2, SolidOperation.Additive);
  const right = model.addBoxBrush(2, SolidOperation.Additive);
  left.position.set(-0.5, 0, 0);
  right.position.set(0.5, 0, 0);
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
  return model;
}
