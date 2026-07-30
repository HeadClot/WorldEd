import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidCsgCompiler } from '@/solid/algorithm/compile/solid_csg_compiler.js';
import { SolidCsgTree } from '@/solid/algorithm/compile/solid_csg_tree.js';
import { SolidCsgTreeEvaluator } from '@/solid/algorithm/compile/solid_csg_tree_evaluator.js';
import { BuilderSolidAlgorithmRoutingTable } from '@/solid/algorithm/routing/builder_solid_algorithm_routing_table.js';
import { BrushMembership } from '@/solid/algorithm/spatial/brush_membership.js';
import { markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import { SurfaceCategory } from '@/solid/types/surface_category.js';
import { SurfaceTriangulator } from '@/solid/algorithm/surface/surface_triangulator.js';
import type { PreparedBrush } from '@/solid/algorithm/compile/solid_compile_types.js';

/**
 * Prepares visible brushes in scene evaluation order.
 *
 * @param model Solid model.
 * @returns Prepared brush list.
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
        overlappingPeerIndices: [] as number[],
        operation: instance.operation,
      };
    });
}

/**
 * Hierarchical membership at a model-space point.
 *
 * @param model Solid model with hierarchy.
 * @param point Sample point.
 * @returns True when inside the final solid.
 */
function evaluateMembership(model: SolidModel, point: THREE.Vector3): boolean {
  const prepared = prepareVisibleBrushes(model);
  const tree = SolidCsgTree.fromSceneGraph(model.root, prepared);
  return SolidCsgTreeEvaluator.evaluateMembership(point, prepared, tree, false, (sample, entry) =>
    BrushMembership.isInsidePlanes(sample, entry.brush.planes),
  );
}

/**
 * Routes a subject-owned surface category at a centroid with hierarchical eval.
 *
 * @param model Solid model.
 * @param subjectIndex Subject prepared index.
 * @param centroid Fragment centroid.
 * @param normal Face normal.
 * @returns Final surface category.
 */
function routeHierarchical(
  model: SolidModel,
  subjectIndex: number,
  centroid: THREE.Vector3,
  normal: THREE.Vector3,
): SurfaceCategory {
  const prepared = prepareVisibleBrushes(model);
  const tree = SolidCsgTree.fromSceneGraph(model.root, prepared);
  return SolidCsgTreeEvaluator.routeCategory(centroid, normal, prepared, tree, subjectIndex, false);
}

/**
 * Builds the (incorrect) flat leaf-op table category for the same subject so
 * the regression documents why hierarchy must not be linearized.
 *
 * @param prepared Prepared brushes in DFS leaf order.
 * @param subjectIndex Subject index.
 * @param centroid Fragment centroid.
 * @param normal Face normal.
 * @returns Category from a flat linear table over all leaves.
 */
function routeFlatLinearized(
  prepared: readonly PreparedBrush[],
  subjectIndex: number,
  centroid: THREE.Vector3,
  normal: THREE.Vector3,
): SurfaceCategory {
  const tree = SolidCsgTree.fromPreparedFlat(prepared);
  const peers = prepared.map((_, index) => index).filter((index) => index !== subjectIndex);
  const table = BuilderSolidAlgorithmRoutingTable.buildForSubject(prepared, subjectIndex, peers, tree, false, true);
  return table.route((preparedIndex) => {
    if (preparedIndex === subjectIndex) return SurfaceCategory.SelfAligned;
    const peer = prepared[preparedIndex];
    if (!peer) return SurfaceCategory.Outside;
    return BrushMembership.classifyPoint(centroid, peer.brush, normal);
  });
}

/**
 * Group-local ∩ must not clip sibling brushes outside the group (branch/leaf
 * model: children combine from empty, branch applies once to the parent).
 */
describe('Solid CSG group intersect isolation', () => {
  it('keeps an outside sibling brush when a group ends with intersecting', () => {
    const model = new SolidModel('GroupIntersectSibling');
    const additive = model.addBoxBrush(4, SolidOperation.Additive);
    const subtractive = model.addBoxBrush(2, SolidOperation.Subtractive);
    const intersecting = model.addBoxBrush(3, SolidOperation.Intersecting);
    additive.position.set(0, 0, 0);
    subtractive.position.set(0.5, 0, 0);
    intersecting.position.set(0, 0, 0);
    additive.pushTransformToMesh();
    subtractive.pushTransformToMesh();
    intersecting.pushTransformToMesh();
    const group = new THREE.Group();
    markAsSolidCsgGroup(group, SolidOperation.Additive);
    model.root.add(group);
    group.add(additive.mesh!);
    group.add(subtractive.mesh!);
    group.add(intersecting.mesh!);
    const outside = model.addBoxBrush(2, SolidOperation.Additive);
    outside.position.set(12, 0, 0);
    outside.pushTransformToMesh();
    model.syncBrushOrderFromScene();
    model.markDirty();
    model.rebuild(true);

    const outsideCenter = new THREE.Vector3(12, 0, 0);
    expect(evaluateMembership(model, outsideCenter)).toBe(true);
    expect(evaluateMembership(model, new THREE.Vector3(20, 0, 0))).toBe(false);

    const prepared = prepareVisibleBrushes(model);
    const outsideIndex = prepared.findIndex((entry) => entry.instance.id === outside.id);
    expect(outsideIndex).toBeGreaterThanOrEqual(0);
    const faceNormal = new THREE.Vector3(1, 0, 0);
    const faceCentroid = new THREE.Vector3(13, 0, 0);
    const hierarchical = routeHierarchical(model, outsideIndex, faceCentroid, faceNormal);
    expect(hierarchical).toBe(SurfaceCategory.SelfAligned);

    const resultCount = model.getResultMesh().geometry.getAttribute('position')?.count ?? 0;
    expect(resultCount).toBeGreaterThan(0);

    const compiler = new SolidCsgCompiler();
    const polygons = compiler.compile(model.getBrushes(), { forceFull: true, solidRoot: model.root });
    const arrays = SurfaceTriangulator.buildMeshArrays(polygons);
    expect(arrays.triangleCount).toBeGreaterThan(0);

    const outsidePolygons = polygons.filter((polygon) => polygon.brushId === outside.id);
    expect(outsidePolygons.length).toBeGreaterThan(0);
  });

  it('does not let a group-internal ∩ kill a prior root additive via flat linearization', () => {
    const model = new SolidModel('PriorRootVsGroupIntersect');
    const room = model.addBoxBrush(10, SolidOperation.Additive);
    room.position.set(0, 0, 0);
    room.pushTransformToMesh();
    const block = model.addBoxBrush(4, SolidOperation.Additive);
    const clip = model.addBoxBrush(2, SolidOperation.Intersecting);
    block.position.set(0, 0, 0);
    clip.position.set(0, 0, 0);
    block.pushTransformToMesh();
    clip.pushTransformToMesh();
    const group = new THREE.Group();
    markAsSolidCsgGroup(group, SolidOperation.Additive);
    model.root.add(group);
    group.add(block.mesh!);
    group.add(clip.mesh!);
    model.syncBrushOrderFromScene();

    const prepared = prepareVisibleBrushes(model);
    const tree = SolidCsgTree.fromSceneGraph(model.root, prepared);
    expect(tree.isFlat).toBe(false);
    const roomIndex = prepared.findIndex((entry) => entry.instance.id === room.id);
    const faceCentroid = new THREE.Vector3(4.5, 0, 0);
    const faceNormal = new THREE.Vector3(1, 0, 0);
    const hierarchical = SolidCsgTreeEvaluator.routeCategory(
      faceCentroid,
      faceNormal,
      prepared,
      tree,
      roomIndex,
      false,
    );
    expect(hierarchical).toBe(SurfaceCategory.SelfAligned);

    // Flat leaf-op tables apply nested ∩ to the whole chain — incorrect for groups.
    const flatBroken = routeFlatLinearized(prepared, roomIndex, faceCentroid, faceNormal);
    expect(flatBroken).not.toBe(SurfaceCategory.SelfAligned);

    model.markDirty();
    model.rebuild(true);
    expect(evaluateMembership(model, new THREE.Vector3(4.5, 0, 0))).toBe(true);
    expect(evaluateMembership(model, new THREE.Vector3(0, 0, 0))).toBe(true);
  });

  it('refuses to build flat routing tables for hierarchical trees', () => {
    const model = new SolidModel('NoFlatTablesForHierarchy');
    const a = model.addBoxBrush(2, SolidOperation.Additive);
    const b = model.addBoxBrush(2, SolidOperation.Intersecting);
    const group = new THREE.Group();
    markAsSolidCsgGroup(group);
    model.root.add(group);
    group.add(a.mesh!);
    group.add(b.mesh!);
    model.syncBrushOrderFromScene();
    const prepared = prepareVisibleBrushes(model);
    const tree = SolidCsgTree.fromSceneGraph(model.root, prepared);
    expect(tree.isFlat).toBe(false);
    const table = BuilderSolidAlgorithmRoutingTable.buildForSubject(prepared, 0, [1], tree, false, true);
    expect(table.steps.length).toBe(0);
  });

  it('still intersects sequential flat brushes when no groups exist', () => {
    const model = new SolidModel('FlatSequentialIntersect');
    const large = model.addBoxBrush(4, SolidOperation.Additive);
    const clip = model.addBoxBrush(2, SolidOperation.Intersecting);
    large.position.set(0, 0, 0);
    clip.position.set(0, 0, 0);
    large.pushTransformToMesh();
    clip.pushTransformToMesh();
    model.syncBrushOrderFromScene();
    model.markDirty();
    model.rebuild(true);
    expect(evaluateMembership(model, new THREE.Vector3(0, 0, 0))).toBe(true);
    expect(evaluateMembership(model, new THREE.Vector3(1.4, 0, 0))).toBe(false);
  });
});
