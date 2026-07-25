import * as THREE from 'three';
import { SurfaceCategory } from '../types/surface_category.js';
import { BrushMembership } from './brush_membership.js';
import { CategoryRouter } from './category_router.js';
import type { PreparedBrush } from './solid_compile_types.js';
import { forEachSubjectAndPeersInOrder } from './subject_peer_order.js';

/**
 * Routes fragment surface categories through ordered brush operations using
 * full tree walks or local overlap-only walks.
 */
export class SolidFragmentRouter {
  private hasIntersectingOperations = false;
  private invertedWorld = false;
  private readonly scratchCentroid = new THREE.Vector3();

  /**
   * Updates whether intersecting operations force full tree routing.
   *
   * @param value True when any brush uses intersecting CSG.
   */
  setHasIntersectingOperations(value: boolean): void {
    this.hasIntersectingOperations = value;
  }

  /**
   * Sets whether routing starts as solid (inverted world).
   *
   * @param value True when the world begins full.
   */
  setInvertedWorld(value: boolean): void {
    this.invertedWorld = value;
  }

  /**
   * Routes a fragment's categories through brush operations in tree order.
   * Additive/subtractive-only models use the local touch set. With any
   * intersecting op, routes against every brush so sequential ∩ clips the
   * entire previous solid.
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
   * Full tree-order routing: classify against every brush (disjoint AABBs are
   * Outside via classification). Required for true sequential intersection.
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
    let category = this.initialRouteCategory();
    BrushMembership.polygonCentroidInto(fragment, this.scratchCentroid);
    for (let index = 0; index < prepared.length; index++) {
      const peer = prepared[index];
      if (!peer) continue;
      const relative =
        index === subjectIndex
          ? SurfaceCategory.SelfAligned
          : BrushMembership.classifyPoint(this.scratchCentroid, peer.brush, normal);
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
    let category = this.initialRouteCategory();
    const subject = prepared[subjectIndex];
    if (!subject) return category;
    BrushMembership.polygonCentroidInto(fragment, this.scratchCentroid);
    forEachSubjectAndPeersInOrder(subject.overlappingPeerIndices, subjectIndex, (index) => {
      const peer = prepared[index];
      if (!peer) return;
      category = this.routeOneLocalPeer(category, this.scratchCentroid, normal, peer, index, subjectIndex);
    });
    return category;
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
   * Starting category for route accumulation.
   *
   * @returns Inside when inverted world; Outside otherwise.
   */
  private initialRouteCategory(): SurfaceCategory {
    return this.invertedWorld ? SurfaceCategory.Inside : SurfaceCategory.Outside;
  }
}
