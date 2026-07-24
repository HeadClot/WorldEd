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
    const subject = prepared[subjectIndex];
    const overlapSet = new Set(subject.overlappingPeerIndices);
    overlapSet.add(subjectIndex);
    for (let index = 0; index < prepared.length; index++) {
      const peer = prepared[index];
      const relative = this.relativeCategoryForPeer(fragment, normal, peer, index, subjectIndex, overlapSet);
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
    const subject = prepared[subjectIndex];
    const relevant = subject.overlappingPeerIndices.concat(subjectIndex).sort((a, b) => a - b);
    for (const index of relevant) {
      category = this.routeOneLocalPeer(category, fragment, normal, prepared[index], index, subjectIndex);
    }
    return category;
  }

  /**
   * Resolves the category of a fragment relative to one peer brush.
   *
   * @param fragment Fragment polygon.
   * @param normal Face normal.
   * @param peer Peer prepared brush.
   * @param peerIndex Peer index.
   * @param subjectIndex Subject index.
   * @param overlapSet Overlap set including the subject.
   * @returns Relative surface category.
   */
  relativeCategoryForPeer(
    fragment: THREE.Vector3[],
    normal: THREE.Vector3,
    peer: PreparedBrush,
    peerIndex: number,
    subjectIndex: number,
    overlapSet: Set<number>,
  ): SurfaceCategory {
    if (peerIndex === subjectIndex) return SurfaceCategory.SelfAligned;
    if (!overlapSet.has(peerIndex)) return SurfaceCategory.Outside;
    return BrushMembership.classifyPolygon(fragment, peer.brush, normal);
  }

  /**
   * Routes one local peer into the accumulated category.
   *
   * @param category Accumulated category.
   * @param fragment Fragment polygon.
   * @param normal Face normal.
   * @param peer Peer prepared brush.
   * @param peerIndex Peer index.
   * @param subjectIndex Subject index.
   * @returns Updated category.
   */
  private routeOneLocalPeer(
    category: SurfaceCategory,
    fragment: THREE.Vector3[],
    normal: THREE.Vector3,
    peer: PreparedBrush,
    peerIndex: number,
    subjectIndex: number,
  ): SurfaceCategory {
    const relative =
      peerIndex === subjectIndex
        ? SurfaceCategory.SelfAligned
        : BrushMembership.classifyPolygon(fragment, peer.brush, normal);
    return CategoryRouter.route(category, relative, peer.operation);
  }
}
