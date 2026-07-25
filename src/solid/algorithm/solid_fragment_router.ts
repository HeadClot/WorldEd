import * as THREE from 'three';
import { SurfaceCategory } from '../types/surface_category.js';
import { BrushMembership } from './brush_membership.js';
import { CategoryRouter } from './category_router.js';
import type { PreparedBrush } from './solid_compile_types.js';

/**
 * Routes fragment surface categories through ordered brush operations using
 * full tree walks or local overlap-only walks.
 */
export class SolidFragmentRouter {
  private hasIntersectingOperations = false;
  private readonly scratchCentroid = new THREE.Vector3();
  private readonly scratchOverlapFlags: boolean[] = [];

  /**
   * Updates whether intersecting operations force full tree routing.
   *
   * @param value True when any brush uses intersecting CSG.
   */
  setHasIntersectingOperations(value: boolean): void {
    this.hasIntersectingOperations = value;
  }

  /**
   * Routes a fragment's categories through brush operations in tree order.
   *
   * @param fragment Fragment polygon.
   * @param normal Face normal.
   * @param prepared All brushes.
   * @param subjectIndex Subject brush index.
   * @returns Final routed category.
   */
  routeFragmentCategory(
    fragment: THREE.Vector3[],
    normal: THREE.Vector3,
    prepared: PreparedBrush[],
    subjectIndex: number,
  ): SurfaceCategory {
    if (this.hasIntersectingOperations) {
      return this.routeFragmentCategoryFull(fragment, normal, prepared, subjectIndex);
    }
    return this.routeFragmentCategoryLocal(fragment, normal, prepared, subjectIndex);
  }

  /**
   * Full tree-order routing including non-overlapping peers.
   *
   * @param fragment Fragment polygon.
   * @param normal Face normal.
   * @param prepared All brushes.
   * @param subjectIndex Subject brush index.
   * @returns Final routed category.
   */
  routeFragmentCategoryFull(
    fragment: THREE.Vector3[],
    normal: THREE.Vector3,
    prepared: PreparedBrush[],
    subjectIndex: number,
  ): SurfaceCategory {
    let category = SurfaceCategory.Outside;
    const subject = prepared[subjectIndex]!;
    this.fillOverlapFlags(subject.overlappingPeerIndices, subjectIndex, prepared.length);
    BrushMembership.polygonCentroidInto(fragment, this.scratchCentroid);
    for (let index = 0; index < prepared.length; index++) {
      const peer = prepared[index]!;
      const relative = this.relativeCategoryForPeer(
        this.scratchCentroid,
        normal,
        peer,
        index,
        subjectIndex,
        this.scratchOverlapFlags,
      );
      category = CategoryRouter.route(category, relative, peer.operation);
    }
    return category;
  }

  /**
   * Local routing through self and overlapping peers only.
   *
   * @param fragment Fragment polygon.
   * @param normal Face normal.
   * @param prepared All brushes.
   * @param subjectIndex Subject brush index.
   * @returns Final routed category.
   */
  routeFragmentCategoryLocal(
    fragment: THREE.Vector3[],
    normal: THREE.Vector3,
    prepared: PreparedBrush[],
    subjectIndex: number,
  ): SurfaceCategory {
    let category = SurfaceCategory.Outside;
    const subject = prepared[subjectIndex]!;
    BrushMembership.polygonCentroidInto(fragment, this.scratchCentroid);
    this.forEachLocalPeerInOrder(subject.overlappingPeerIndices, subjectIndex, (index) => {
      category = this.routeOneLocalPeer(category, this.scratchCentroid, normal, prepared[index]!, index, subjectIndex);
    });
    return category;
  }

  /**
   * Resolves the category of a fragment relative to one peer brush.
   *
   * @param fragmentCentroid Fragment centroid in model space.
   * @param normal Face normal.
   * @param peer Peer prepared brush.
   * @param peerIndex Peer index.
   * @param subjectIndex Subject index.
   * @param overlapFlags Flags for overlapping peers including the subject.
   * @returns Relative surface category.
   */
  relativeCategoryForPeer(
    fragmentCentroid: THREE.Vector3,
    normal: THREE.Vector3,
    peer: PreparedBrush,
    peerIndex: number,
    subjectIndex: number,
    overlapFlags: readonly boolean[],
  ): SurfaceCategory {
    if (peerIndex === subjectIndex) return SurfaceCategory.SelfAligned;
    if (!overlapFlags[peerIndex]) return SurfaceCategory.Outside;
    return BrushMembership.classifyPoint(fragmentCentroid, peer.brush, normal);
  }

  /**
   * Routes one local peer into the accumulated category.
   *
   * @param category Accumulated category.
   * @param fragmentCentroid Fragment centroid in model space.
   * @param normal Face normal.
   * @param peer Peer prepared brush.
   * @param peerIndex Peer index.
   * @param subjectIndex Subject index.
   * @returns Updated category.
   */
  private routeOneLocalPeer(
    category: SurfaceCategory,
    fragmentCentroid: THREE.Vector3,
    normal: THREE.Vector3,
    peer: PreparedBrush,
    peerIndex: number,
    subjectIndex: number,
  ): SurfaceCategory {
    const relative =
      peerIndex === subjectIndex
        ? SurfaceCategory.SelfAligned
        : BrushMembership.classifyPoint(fragmentCentroid, peer.brush, normal);
    return CategoryRouter.route(category, relative, peer.operation);
  }

  /**
   * Fills a reusable boolean table for full-tree overlap membership tests.
   *
   * @param peerIndices Overlapping peer indices for the subject.
   * @param subjectIndex Subject brush index.
   * @param preparedCount Prepared brush count.
   */
  private fillOverlapFlags(peerIndices: readonly number[], subjectIndex: number, preparedCount: number): void {
    while (this.scratchOverlapFlags.length < preparedCount) {
      this.scratchOverlapFlags.push(false);
    }
    for (let index = 0; index < preparedCount; index++) {
      this.scratchOverlapFlags[index] = false;
    }
    this.scratchOverlapFlags[subjectIndex] = true;
    for (const peerIndex of peerIndices) {
      this.scratchOverlapFlags[peerIndex] = true;
    }
  }

  /**
   * Walks a sorted peer list plus the subject in ascending prepared-index
   * order.
   *
   * @param sortedPeers Sorted overlapping peer indices.
   * @param subjectIndex Subject brush index.
   * @param visit Callback for each index in order.
   */
  private forEachLocalPeerInOrder(
    sortedPeers: readonly number[],
    subjectIndex: number,
    visit: (index: number) => void,
  ): void {
    let insertedSelf = false;
    for (const peerIndex of sortedPeers) {
      if (!insertedSelf && subjectIndex < peerIndex) {
        visit(subjectIndex);
        insertedSelf = true;
      }
      visit(peerIndex);
    }
    if (!insertedSelf) {
      visit(subjectIndex);
    }
  }
}
