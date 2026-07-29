import * as THREE from 'three';
import { SolidOperation } from '../types/solid_operation.js';
import { boundsContainPointPadded } from './bounds_overlap.js';
import { BrushMembership } from './brush_membership.js';
import { BrushSpatialIndex } from './brush_spatial_index.js';
import type { PreparedBrush } from './solid_compile_types.js';
import { SolidCsgTree } from './solid_csg_tree.js';
import { SolidCsgTreeEvaluator } from './solid_csg_tree_evaluator.js';
import { forEachSubjectAndPeersInOrder } from './subject_peer_order.js';

/**
 * Evaluates solid membership and boundary status for CSG fragments using
 * hierarchical trees, ordered operations, spatial indexing, and scratch sample
 * points.
 */
export class SolidMembershipEvaluator {
  private readonly membershipEpsilon: number;
  private readonly boundsPad: number;
  private readonly scratchCentroid = new THREE.Vector3();
  private readonly scratchOutside = new THREE.Vector3();
  private readonly scratchInside = new THREE.Vector3();
  private readonly scratchCandidates: number[] = [];
  private hasIntersectingOperations = false;
  private invertedWorld = false;
  private membershipIndex: BrushSpatialIndex | null = null;
  private csgTree: SolidCsgTree | null = null;

  /**
   * Creates a membership evaluator.
   *
   * @param membershipEpsilon Fat-plane epsilon for plane membership tests.
   * @param boundsPad Padding applied to AABB containment tests.
   */
  constructor(membershipEpsilon: number, boundsPad: number) {
    this.membershipEpsilon = membershipEpsilon;
    this.boundsPad = boundsPad;
  }

  /**
   * Updates whether the prepared set contains intersecting operations.
   *
   * @param value True when any brush uses intersecting CSG.
   */
  setHasIntersectingOperations(value: boolean): void {
    this.hasIntersectingOperations = value;
  }

  /**
   * Sets whether the CSG fold starts as solid (inverted world).
   *
   * @param value True when the world begins full.
   */
  setInvertedWorld(value: boolean): void {
    this.invertedWorld = value;
  }

  /**
   * Installs the spatial index used for local membership queries.
   *
   * @param index Spatial index, or null to fall back to linear scans.
   */
  setMembershipIndex(index: BrushSpatialIndex | null): void {
    this.membershipIndex = index;
  }

  /**
   * Installs the hierarchical CSG tree for the current compile. Null falls back
   * to flat prepared order.
   *
   * @param tree Hierarchical tree, or null for flat membership.
   */
  setCsgTree(tree: SolidCsgTree | null): void {
    this.csgTree = tree;
  }

  /**
   * Double-checks boundary status with solid-membership samples across the
   * face.
   *
   * @param fragment Fragment vertices.
   * @param normal Face normal.
   * @param prepared All brushes.
   * @param subjectIndex Optional subject brush; when set, local membership only
   *   considers the subject and its overlapping peers.
   * @returns True when the fragment lies on the final solid boundary.
   */
  isBoundaryFragment(
    fragment: THREE.Vector3[],
    normal: THREE.Vector3,
    prepared: PreparedBrush[],
    subjectIndex?: number,
  ): boolean {
    this.computeCentroidInto(fragment, this.scratchCentroid);
    const offset = Math.max(this.membershipEpsilon * 4, 1e-4);
    this.scratchOutside.copy(this.scratchCentroid).addScaledVector(normal, offset);
    this.scratchInside.copy(this.scratchCentroid).addScaledVector(normal, -offset);
    const outsideInSolid = this.evaluateSolidMembership(this.scratchOutside, prepared, subjectIndex);
    const insideInSolid = this.evaluateSolidMembership(this.scratchInside, prepared, subjectIndex);
    return outsideInSolid !== insideInSolid;
  }

  /**
   * Evaluates the ordered CSG expression at a point. Hierarchical trees always
   * use full structural evaluation. With intersecting ops, always uses the full
   * brush list. Without intersecting ops on flat trees, uses spatial/local peer
   * restriction for speed.
   *
   * @param point Sample point in model space.
   * @param prepared Brush list in tree order.
   * @param subjectIndex Optional subject brush for local peer restriction.
   * @returns True when the point is inside the final solid.
   */
  evaluateSolidMembership(point: THREE.Vector3, prepared: PreparedBrush[], subjectIndex?: number): boolean {
    if (this.csgTree && !this.csgTree.isFlat) {
      return this.evaluateSolidMembershipHierarchical(point, prepared, subjectIndex);
    }
    if (this.hasIntersectingOperations) {
      return this.evaluateSolidMembershipFull(point, prepared);
    }
    if (subjectIndex !== undefined) {
      return this.evaluateSolidMembershipAmongPeers(point, prepared, subjectIndex);
    }
    return this.evaluateSolidMembershipLocal(point, prepared);
  }

  /**
   * Hierarchical membership through compound branches (group operations). When
   * subjectIndex is set and no intersecting ops are present, only the subject
   * and its overlapping peers are tested (non-peers are Outside).
   *
   * @param point Sample point.
   * @param prepared Brush list.
   * @param subjectIndex Optional subject for peer-local tests.
   * @returns Solid membership.
   */
  evaluateSolidMembershipHierarchical(point: THREE.Vector3, prepared: PreparedBrush[], subjectIndex?: number): boolean {
    if (!this.csgTree) {
      return this.evaluateSolidMembershipFull(point, prepared);
    }
    const relevant =
      subjectIndex !== undefined && !this.hasIntersectingOperations
        ? this.buildPeerRelevantSet(prepared, subjectIndex)
        : null;
    return SolidCsgTreeEvaluator.evaluateMembershipFiltered(
      point,
      prepared,
      this.csgTree,
      this.invertedWorld,
      (sample, entry) => this.pointInsidePreparedBrush(sample, entry),
      relevant,
    );
  }

  /**
   * Full tree-order membership including non-overlapping intersecting operands.
   *
   * @param point Sample point.
   * @param prepared Brush list.
   * @returns Solid membership.
   */
  evaluateSolidMembershipFull(point: THREE.Vector3, prepared: PreparedBrush[]): boolean {
    if (this.csgTree && !this.csgTree.isFlat) {
      return this.evaluateSolidMembershipHierarchical(point, prepared);
    }
    let inside = this.invertedWorld;
    for (const entry of prepared) {
      inside = this.evaluateOneBrushMembership(inside, point, entry);
    }
    return inside;
  }

  /**
   * Builds subject + peer prepared indices for local hierarchical tests.
   *
   * @param prepared Prepared brushes.
   * @param subjectIndex Subject index.
   * @returns Relevant index set.
   */
  private buildPeerRelevantSet(prepared: PreparedBrush[], subjectIndex: number): Set<number> {
    const subject = prepared[subjectIndex];
    const relevant = new Set<number>(subject?.overlappingPeerIndices ?? []);
    relevant.add(subjectIndex);
    return relevant;
  }

  /**
   * Returns whether a point is inside a prepared brush volume (bounds +
   * planes).
   *
   * @param point Sample point.
   * @param entry Prepared brush.
   * @returns True when inside the brush.
   */
  private pointInsidePreparedBrush(point: THREE.Vector3, entry: PreparedBrush): boolean {
    if (!this.boundsContainPoint(entry.bounds, point)) return false;
    return BrushMembership.isInsidePlanes(point, entry.brush.planes, this.membershipEpsilon);
  }

  /**
   * Membership for additive/subtractive models using the spatial brush index.
   * When subjectIndex is provided, only the subject and its overlapping peers
   * can affect membership (same locality assumption as local fragment
   * routing).
   *
   * @param point Sample point.
   * @param prepared Brush list.
   * @param subjectIndex Optional subject brush index for peer-local tests.
   * @returns Solid membership.
   */
  evaluateSolidMembershipLocal(point: THREE.Vector3, prepared: PreparedBrush[], subjectIndex?: number): boolean {
    if (subjectIndex !== undefined) {
      return this.evaluateSolidMembershipAmongPeers(point, prepared, subjectIndex);
    }
    const candidates = this.resolveMembershipCandidates(point, prepared);
    if (candidates.length === 0) return this.invertedWorld;
    this.copyAndSortCandidates(candidates);
    return this.evaluateSortedCandidates(point, prepared);
  }

  /**
   * Evaluates membership using only a subject brush and its sorted peers.
   *
   * @param point Sample point.
   * @param prepared Brush list.
   * @param subjectIndex Subject prepared index.
   * @returns Solid membership.
   */
  private evaluateSolidMembershipAmongPeers(
    point: THREE.Vector3,
    prepared: PreparedBrush[],
    subjectIndex: number,
  ): boolean {
    const subject = prepared[subjectIndex];
    if (!subject) return this.invertedWorld;
    this.scratchCandidates.length = 0;
    forEachSubjectAndPeersInOrder(subject.overlappingPeerIndices, subjectIndex, (index) => {
      this.scratchCandidates.push(index);
    });
    return this.evaluateSortedCandidates(point, prepared);
  }

  /**
   * Applies CSG operations for candidate indices already sorted in tree order.
   *
   * @param point Sample point.
   * @param prepared Brush list.
   * @returns Solid membership.
   */
  private evaluateSortedCandidates(point: THREE.Vector3, prepared: PreparedBrush[]): boolean {
    let inside = this.invertedWorld;
    for (const index of this.scratchCandidates) {
      const entry = prepared[index];
      if (!entry) continue;
      if (!this.boundsContainPoint(entry.bounds, point)) {
        inside = this.applyOperation(inside, false, entry.operation);
        continue;
      }
      const inBrush = BrushMembership.isInsidePlanes(point, entry.brush.planes, this.membershipEpsilon);
      inside = this.applyOperation(inside, inBrush, entry.operation);
    }
    return inside;
  }

  /**
   * Copies candidate indices into reusable storage and sorts them in tree
   * order.
   *
   * @param candidates Unsorted candidate prepared indices.
   */
  private copyAndSortCandidates(candidates: readonly number[]): void {
    this.scratchCandidates.length = 0;
    for (const index of candidates) {
      this.scratchCandidates.push(index);
    }
    this.scratchCandidates.sort((left, right) => left - right);
  }

  /**
   * Linear fallback that lists brushes whose bounds contain a point.
   *
   * @param point Sample point.
   * @param prepared Brush list.
   * @returns Prepared indices.
   */
  collectContainingBrushIndices(point: THREE.Vector3, prepared: PreparedBrush[]): number[] {
    const indices: number[] = [];
    for (let index = 0; index < prepared.length; index++) {
      const entry = prepared[index];
      if (entry && this.boundsContainPoint(entry.bounds, point)) {
        indices.push(index);
      }
    }
    return indices;
  }

  /**
   * Applies a CSG operation to an accumulated membership flag.
   *
   * @param current Current solid membership.
   * @param inBrush Whether the point is inside the operand brush.
   * @param operation Operand operation.
   * @returns Updated membership.
   */
  applyOperation(current: boolean, inBrush: boolean, operation: SolidOperation): boolean {
    if (operation === SolidOperation.Additive) return current || inBrush;
    if (operation === SolidOperation.Subtractive) return current && !inBrush;
    return current && inBrush;
  }

  /**
   * Returns whether a padded AABB contains a point.
   *
   * @param bounds Axis-aligned bounds.
   * @param point Sample point.
   * @returns True when the point is inside the expanded box.
   */
  boundsContainPoint(bounds: THREE.Box3, point: THREE.Vector3): boolean {
    return boundsContainPointPadded(bounds, point, this.boundsPad);
  }

  /**
   * Writes the arithmetic centroid of a polygon into a target vector.
   *
   * @param polygon Vertices.
   * @param target Output vector.
   */
  computeCentroidInto(polygon: THREE.Vector3[], target: THREE.Vector3): void {
    target.set(0, 0, 0);
    for (const point of polygon) {
      target.add(point);
    }
    if (polygon.length > 0) {
      target.multiplyScalar(1 / polygon.length);
    }
  }

  /**
   * Applies one prepared brush to an accumulated membership flag.
   *
   * @param inside Current solid membership.
   * @param point Sample point.
   * @param entry Prepared brush operand.
   * @returns Updated membership.
   */
  private evaluateOneBrushMembership(inside: boolean, point: THREE.Vector3, entry: PreparedBrush): boolean {
    if (!this.boundsContainPoint(entry.bounds, point)) {
      return this.applyOperation(inside, false, entry.operation);
    }
    const inBrush = BrushMembership.isInsidePlanes(point, entry.brush.planes, this.membershipEpsilon);
    return this.applyOperation(inside, inBrush, entry.operation);
  }

  /**
   * Resolves candidate brush indices that may contain a sample point.
   *
   * @param point Sample point.
   * @param prepared Brush list.
   * @returns Candidate prepared indices.
   */
  private resolveMembershipCandidates(point: THREE.Vector3, prepared: PreparedBrush[]): number[] {
    if (this.membershipIndex) {
      return this.membershipIndex.queryPoint(point);
    }
    return this.collectContainingBrushIndices(point, prepared);
  }
}
