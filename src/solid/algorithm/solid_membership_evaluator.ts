import * as THREE from 'three';
import { SolidOperation } from '../types/solid_operation.js';
import { BrushMembership } from './brush_membership.js';
import { BrushSpatialIndex } from './brush_spatial_index.js';
import type { PreparedBrush } from './solid_compile_types.js';

/**
 * Evaluates solid membership and boundary status for CSG fragments using
 * ordered operations, spatial indexing, and scratch sample points.
 */
export class SolidMembershipEvaluator {
  private readonly membershipEpsilon: number;
  private readonly boundsPad: number;
  private readonly scratchCentroid = new THREE.Vector3();
  private readonly scratchOutside = new THREE.Vector3();
  private readonly scratchInside = new THREE.Vector3();
  private readonly scratchCandidates: number[] = [];
  private hasIntersectingOperations = false;
  private membershipIndex: BrushSpatialIndex | null = null;

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
   * Installs the spatial index used for local membership queries.
   *
   * @param index Spatial index, or null to fall back to linear scans.
   */
  setMembershipIndex(index: BrushSpatialIndex | null): void {
    this.membershipIndex = index;
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
   * Evaluates the ordered CSG expression at a point.
   *
   * @param point Sample point in model space.
   * @param prepared Brush list in tree order.
   * @param subjectIndex Optional subject brush for local peer restriction.
   * @returns True when the point is inside the final solid.
   */
  evaluateSolidMembership(point: THREE.Vector3, prepared: PreparedBrush[], subjectIndex?: number): boolean {
    if (this.hasIntersectingOperations) {
      return this.evaluateSolidMembershipFull(point, prepared);
    }
    return this.evaluateSolidMembershipLocal(point, prepared, subjectIndex);
  }

  /**
   * Full tree-order membership including non-overlapping intersecting operands.
   *
   * @param point Sample point.
   * @param prepared Brush list.
   * @returns Solid membership.
   */
  evaluateSolidMembershipFull(point: THREE.Vector3, prepared: PreparedBrush[]): boolean {
    let inside = false;
    for (const entry of prepared) {
      inside = this.evaluateOneBrushMembership(inside, point, entry);
    }
    return inside;
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
    if (candidates.length === 0) return false;
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
    if (!subject) return false;
    this.scratchCandidates.length = 0;
    this.mergeSubjectAndPeersInOrder(subject.overlappingPeerIndices, subjectIndex);
    return this.evaluateSortedCandidates(point, prepared);
  }

  /**
   * Merges a sorted peer list with the subject index into scratchCandidates.
   *
   * @param sortedPeers Sorted overlapping peer indices.
   * @param subjectIndex Subject prepared index.
   */
  private mergeSubjectAndPeersInOrder(sortedPeers: readonly number[], subjectIndex: number): void {
    let insertedSelf = false;
    for (const peerIndex of sortedPeers) {
      if (!insertedSelf && subjectIndex < peerIndex) {
        this.scratchCandidates.push(subjectIndex);
        insertedSelf = true;
      }
      this.scratchCandidates.push(peerIndex);
    }
    if (!insertedSelf) {
      this.scratchCandidates.push(subjectIndex);
    }
  }

  /**
   * Applies CSG operations for candidate indices already sorted in tree order.
   *
   * @param point Sample point.
   * @param prepared Brush list.
   * @returns Solid membership.
   */
  private evaluateSortedCandidates(point: THREE.Vector3, prepared: PreparedBrush[]): boolean {
    let inside = false;
    for (const index of this.scratchCandidates) {
      const entry = prepared[index]!;
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
      if (this.boundsContainPoint(prepared[index]!.bounds, point)) {
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
    const pad = this.boundsPad;
    return (
      point.x >= bounds.min.x - pad &&
      point.x <= bounds.max.x + pad &&
      point.y >= bounds.min.y - pad &&
      point.y <= bounds.max.y + pad &&
      point.z >= bounds.min.z - pad &&
      point.z <= bounds.max.z + pad
    );
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
