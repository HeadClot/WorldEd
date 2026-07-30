import * as THREE from 'three';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SurfaceCategory } from '@/solid/types/surface_category.js';
import { BrushMembership } from '@/solid/algorithm/spatial/brush_membership.js';
import { CategoryRouter } from '@/solid/algorithm/category/category_router.js';
import type { PreparedBrush } from './solid_compile_types.js';
import type { SolidCsgBranchNode, SolidCsgBrushNode, SolidCsgTree, SolidCsgTreeNode } from './solid_csg_tree.js';

/**
 * Evaluates hierarchical solid CSG membership and surface category routing.
 *
 * Branch/leaf evaluation model:
 *
 * - A branch (group) combines its children among themselves starting from empty
 *   (Outside / false), using each child's operation.
 * - Leading non-additive children under a branch are skipped: subtractive or
 *   intersecting ops cannot create solid volume from empty.
 * - That compound solid is then applied to the parent with the branch's own
 *   operation — so an ∩ inside a group only clips the compound, never a sibling
 *   brush outside the group.
 * - Root children fold left-to-right from inverted-world or empty the same way.
 */
export class SolidCsgTreeEvaluator {
  /**
   * Evaluates ordered hierarchical membership at a point.
   *
   * @param point Sample point in model space.
   * @param prepared Prepared brushes.
   * @param tree Hierarchical CSG tree.
   * @param invertedWorld Whether evaluation starts solid.
   * @param isInsideBrush Predicate for point-in-brush tests.
   * @returns True when the point is inside the final solid.
   */
  static evaluateMembership(
    point: THREE.Vector3,
    prepared: readonly PreparedBrush[],
    tree: SolidCsgTree,
    invertedWorld: boolean,
    isInsideBrush: (point: THREE.Vector3, entry: PreparedBrush) => boolean,
  ): boolean {
    return this.evaluateMembershipFiltered(point, prepared, tree, invertedWorld, isInsideBrush, null);
  }

  /**
   * Hierarchical membership with optional peer filtering (non-relevant leaves
   * contribute Outside without plane tests).
   *
   * @param point Sample point in model space.
   * @param prepared Prepared brushes.
   * @param tree Hierarchical CSG tree.
   * @param invertedWorld Whether evaluation starts solid.
   * @param isInsideBrush Predicate for point-in-brush tests.
   * @param relevant Relevant prepared indices, or null for all.
   * @returns True when the point is inside the final solid.
   */
  static evaluateMembershipFiltered(
    point: THREE.Vector3,
    prepared: readonly PreparedBrush[],
    tree: SolidCsgTree,
    invertedWorld: boolean,
    isInsideBrush: (point: THREE.Vector3, entry: PreparedBrush) => boolean,
    relevant: ReadonlySet<number> | null,
  ): boolean {
    let inside = invertedWorld;
    for (const root of tree.roots) {
      const childInside = this.evaluateNodeMembershipFiltered(point, prepared, root, isInsideBrush, relevant);
      inside = this.applyBoolean(inside, childInside, root.operation);
    }
    return inside;
  }

  /**
   * Routes a fragment category through the hierarchical CSG tree.
   *
   * @param fragmentCentroid Fragment centroid in model space.
   * @param normal Face normal.
   * @param prepared Prepared brushes.
   * @param tree Hierarchical CSG tree.
   * @param subjectIndex Subject brush prepared index.
   * @param invertedWorld Whether routing starts solid.
   * @returns Final surface category for the fragment.
   */
  static routeCategory(
    fragmentCentroid: THREE.Vector3,
    normal: THREE.Vector3,
    prepared: readonly PreparedBrush[],
    tree: SolidCsgTree,
    subjectIndex: number,
    invertedWorld: boolean,
  ): SurfaceCategory {
    return this.routeCategoryFiltered(fragmentCentroid, normal, prepared, tree, subjectIndex, invertedWorld, null);
  }

  /**
   * Routes a fragment through the tree while treating brushes outside the
   * relevant set as Outside (no plane tests). Used for peer-local hierarchical
   * updates so compound groups stay O(touch set) not O(map size).
   *
   * @param fragmentCentroid Fragment centroid in model space.
   * @param normal Face normal.
   * @param prepared Prepared brushes.
   * @param tree Hierarchical CSG tree.
   * @param subjectIndex Subject brush prepared index.
   * @param invertedWorld Whether routing starts solid.
   * @param relevant Prepared indices that may affect the subject, or null for
   *   all.
   * @returns Final surface category for the fragment.
   */
  static routeCategoryFiltered(
    fragmentCentroid: THREE.Vector3,
    normal: THREE.Vector3,
    prepared: readonly PreparedBrush[],
    tree: SolidCsgTree,
    subjectIndex: number,
    invertedWorld: boolean,
    relevant: ReadonlySet<number> | null,
  ): SurfaceCategory {
    let category = invertedWorld ? SurfaceCategory.Inside : SurfaceCategory.Outside;
    for (const root of tree.roots) {
      const relative = this.categorizeNodeFiltered(fragmentCentroid, normal, prepared, root, subjectIndex, relevant);
      category = CategoryRouter.route(category, relative, root.operation);
    }
    return category;
  }

  /**
   * Membership of a point against one tree node with optional peer filtering.
   *
   * @param point Sample point.
   * @param prepared Prepared brushes.
   * @param node Tree node.
   * @param isInsideBrush Point-in-brush predicate.
   * @param relevant Relevant prepared indices, or null for all.
   * @returns True when inside the solid defined by this node alone.
   */
  private static evaluateNodeMembershipFiltered(
    point: THREE.Vector3,
    prepared: readonly PreparedBrush[],
    node: SolidCsgTreeNode,
    isInsideBrush: (point: THREE.Vector3, entry: PreparedBrush) => boolean,
    relevant: ReadonlySet<number> | null,
  ): boolean {
    if (node.kind === 'brush') {
      return this.evaluateBrushMembershipFiltered(point, prepared, node, isInsideBrush, relevant);
    }
    return this.evaluateBranchMembershipFiltered(point, prepared, node, isInsideBrush, relevant);
  }

  /**
   * Point membership for a brush leaf (false when filtered out).
   *
   * @param point Sample point.
   * @param prepared Prepared brushes.
   * @param node Brush node.
   * @param isInsideBrush Point-in-brush predicate.
   * @param relevant Relevant prepared indices, or null for all.
   * @returns True when inside the brush.
   */
  private static evaluateBrushMembershipFiltered(
    point: THREE.Vector3,
    prepared: readonly PreparedBrush[],
    node: SolidCsgBrushNode,
    isInsideBrush: (point: THREE.Vector3, entry: PreparedBrush) => boolean,
    relevant: ReadonlySet<number> | null,
  ): boolean {
    if (relevant && !relevant.has(node.preparedIndex)) return false;
    const entry = prepared[node.preparedIndex];
    if (!entry) return false;
    return isInsideBrush(point, entry);
  }

  /**
   * Point membership for a compound branch with peer filtering. Starts from
   * empty and skips leading non-additive children (they cannot produce solid
   * from empty).
   *
   * @param point Sample point.
   * @param prepared Prepared brushes.
   * @param node Branch node.
   * @param isInsideBrush Point-in-brush predicate.
   * @param relevant Relevant prepared indices, or null for all.
   * @returns True when inside the compound solid.
   */
  private static evaluateBranchMembershipFiltered(
    point: THREE.Vector3,
    prepared: readonly PreparedBrush[],
    node: SolidCsgBranchNode,
    isInsideBrush: (point: THREE.Vector3, entry: PreparedBrush) => boolean,
    relevant: ReadonlySet<number> | null,
  ): boolean {
    let inside = false;
    let started = false;
    for (const child of node.children) {
      if (!started && child.operation !== SolidOperation.Additive) {
        continue;
      }
      started = true;
      const childInside = this.evaluateNodeMembershipFiltered(point, prepared, child, isInsideBrush, relevant);
      inside = this.applyBoolean(inside, childInside, child.operation);
    }
    return inside;
  }

  /**
   * Category of a fragment relative to one tree node, optionally peer-filtered.
   *
   * @param fragmentCentroid Fragment centroid.
   * @param normal Face normal.
   * @param prepared Prepared brushes.
   * @param node Tree node.
   * @param subjectIndex Subject brush index.
   * @param relevant Relevant prepared indices, or null for all.
   * @returns Category relative to the solid defined by this node.
   */
  private static categorizeNodeFiltered(
    fragmentCentroid: THREE.Vector3,
    normal: THREE.Vector3,
    prepared: readonly PreparedBrush[],
    node: SolidCsgTreeNode,
    subjectIndex: number,
    relevant: ReadonlySet<number> | null,
  ): SurfaceCategory {
    if (node.kind === 'brush') {
      return this.categorizeBrushFiltered(fragmentCentroid, normal, prepared, node, subjectIndex, relevant);
    }
    return this.categorizeBranchFiltered(fragmentCentroid, normal, prepared, node, subjectIndex, relevant);
  }

  /**
   * Category relative to a single brush, Outside when filtered out.
   *
   * @param fragmentCentroid Fragment centroid.
   * @param normal Face normal.
   * @param prepared Prepared brushes.
   * @param node Brush node.
   * @param subjectIndex Subject brush index.
   * @param relevant Relevant prepared indices, or null for all.
   * @returns Category relative to the brush.
   */
  private static categorizeBrushFiltered(
    fragmentCentroid: THREE.Vector3,
    normal: THREE.Vector3,
    prepared: readonly PreparedBrush[],
    node: SolidCsgBrushNode,
    subjectIndex: number,
    relevant: ReadonlySet<number> | null,
  ): SurfaceCategory {
    if (relevant && !relevant.has(node.preparedIndex)) {
      return SurfaceCategory.Outside;
    }
    if (node.preparedIndex === subjectIndex) {
      return SurfaceCategory.SelfAligned;
    }
    const entry = prepared[node.preparedIndex];
    if (!entry) return SurfaceCategory.Outside;
    return BrushMembership.classifyPoint(fragmentCentroid, entry.brush, normal);
  }

  /**
   * Category relative to a compound branch with optional peer filtering. Starts
   * from Outside and skips leading non-additive children (they never contribute
   * when the compound starts empty).
   *
   * @param fragmentCentroid Fragment centroid.
   * @param normal Face normal.
   * @param prepared Prepared brushes.
   * @param node Branch node.
   * @param subjectIndex Subject brush index.
   * @param relevant Relevant prepared indices, or null for all.
   * @returns Category relative to the compound solid.
   */
  private static categorizeBranchFiltered(
    fragmentCentroid: THREE.Vector3,
    normal: THREE.Vector3,
    prepared: readonly PreparedBrush[],
    node: SolidCsgBranchNode,
    subjectIndex: number,
    relevant: ReadonlySet<number> | null,
  ): SurfaceCategory {
    let category = SurfaceCategory.Outside;
    let started = false;
    for (const child of node.children) {
      if (!started && child.operation !== SolidOperation.Additive) {
        continue;
      }
      started = true;
      const relative = this.categorizeNodeFiltered(fragmentCentroid, normal, prepared, child, subjectIndex, relevant);
      category = CategoryRouter.route(category, relative, child.operation);
    }
    return category;
  }

  /**
   * Applies a CSG boolean to two membership flags.
   *
   * @param current Accumulated membership.
   * @param operand Operand membership.
   * @param operation Boolean operation.
   * @returns Combined membership.
   */
  private static applyBoolean(current: boolean, operand: boolean, operation: SolidOperation): boolean {
    if (operation === SolidOperation.Additive) return current || operand;
    if (operation === SolidOperation.Subtractive) return current && !operand;
    return current && operand;
  }
}
