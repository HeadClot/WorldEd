import type { PreparedBrush } from '@/solid/algorithm/compile/solid_compile_types.js';
import type { SolidAlgorithmCompactNode } from './solid_algorithm_compact_node.js';
import { SOLID_ALGORITHM_INFINITE_PREPARED_INDEX } from './solid_algorithm_compact_node.js';
import { SolidAlgorithmBrushIntersection } from './solid_algorithm_brush_intersection.js';
import { SolidAlgorithmIntersectionType } from './solid_algorithm_intersection_type.js';

/**
 * Chisel BrushesTouchedByBrush for one processed subject: maps compact node ids
 * to IntersectionType, including subject ancestors and touch-peer ancestors.
 * Only tests the subject's bounds-overlap peers (not the full map).
 */
export class SolidAlgorithmBrushesTouched {
  private readonly typeByNodeId = new Map<number, SolidAlgorithmIntersectionType>();

  /**
   * Returns the intersection type for a compact node id.
   *
   * @param nodeId Compact hierarchy node id.
   * @returns Intersection type, or InvalidValue when absent.
   */
  get(nodeId: number): SolidAlgorithmIntersectionType {
    return this.typeByNodeId.get(nodeId) ?? SolidAlgorithmIntersectionType.InvalidValue;
  }

  /**
   * Records an intersection type for a node id.
   *
   * @param nodeId Compact node id.
   * @param type Intersection type.
   */
  set(nodeId: number, type: SolidAlgorithmIntersectionType): void {
    this.typeByNodeId.set(nodeId, type);
  }

  /**
   * Builds the touch map for one subject against the compact hierarchy.
   *
   * @param prepared Prepared brushes.
   * @param subjectIndex Subject prepared index.
   * @param hierarchy Compact hierarchy (root at 0).
   * @param boundsPad Bounds pad for touch tests.
   * @param membershipEpsilon Plane epsilon.
   * @returns Touch map for CreateRoutingTableJob.
   */
  static buildForSubject(
    prepared: readonly PreparedBrush[],
    subjectIndex: number,
    hierarchy: readonly SolidAlgorithmCompactNode[],
    boundsPad: number,
    membershipEpsilon: number,
  ): SolidAlgorithmBrushesTouched {
    const subject = prepared[subjectIndex];
    const touched = new SolidAlgorithmBrushesTouched();
    if (!subject || hierarchy.length === 0) {
      return touched;
    }
    const preparedIndexToNodeIndex = this.buildPreparedIndexLookup(hierarchy);
    const root = hierarchy[0]!;
    touched.set(root.nodeId, SolidAlgorithmIntersectionType.Intersection);
    this.markSubjectAndAncestors(subjectIndex, hierarchy, preparedIndexToNodeIndex, touched);
    this.markOverlapPeersAndAncestors(
      prepared,
      subject,
      subjectIndex,
      hierarchy,
      preparedIndexToNodeIndex,
      boundsPad,
      membershipEpsilon,
      touched,
    );
    return touched;
  }

  /**
   * Maps prepared brush index → compact hierarchy index for O(1) peer lookup.
   *
   * @param hierarchy Compact hierarchy.
   * @returns Map of prepared index to hierarchy index.
   */
  private static buildPreparedIndexLookup(hierarchy: readonly SolidAlgorithmCompactNode[]): Map<number, number> {
    const map = new Map<number, number>();
    for (let index = 0; index < hierarchy.length; index++) {
      const node = hierarchy[index]!;
      if (node.kind === 'brush') {
        map.set(node.preparedIndex, index);
      }
    }
    return map;
  }

  /**
   * Marks the subject brush and every ancestor branch as Intersection.
   *
   * @param subjectIndex Subject prepared index.
   * @param hierarchy Compact hierarchy.
   * @param preparedIndexToNodeIndex Prepared → hierarchy index map.
   * @param touched Touch map to fill.
   */
  private static markSubjectAndAncestors(
    subjectIndex: number,
    hierarchy: readonly SolidAlgorithmCompactNode[],
    preparedIndexToNodeIndex: ReadonlyMap<number, number>,
    touched: SolidAlgorithmBrushesTouched,
  ): void {
    const subjectNodeIndex = preparedIndexToNodeIndex.get(subjectIndex);
    if (subjectNodeIndex === undefined) {
      return;
    }
    touched.set(hierarchy[subjectNodeIndex]!.nodeId, SolidAlgorithmIntersectionType.Intersection);
    this.markAncestorChain(subjectNodeIndex, hierarchy, touched);
  }

  /**
   * Classifies only bounds-overlap peers (and infinite brush if present).
   *
   * @param prepared Prepared brushes.
   * @param subject Subject brush.
   * @param subjectIndex Subject index.
   * @param hierarchy Compact hierarchy.
   * @param preparedIndexToNodeIndex Prepared → hierarchy index map.
   * @param boundsPad Bounds pad.
   * @param membershipEpsilon Plane epsilon.
   * @param touched Touch map to fill.
   */
  private static markOverlapPeersAndAncestors(
    prepared: readonly PreparedBrush[],
    subject: PreparedBrush,
    subjectIndex: number,
    hierarchy: readonly SolidAlgorithmCompactNode[],
    preparedIndexToNodeIndex: ReadonlyMap<number, number>,
    boundsPad: number,
    membershipEpsilon: number,
    touched: SolidAlgorithmBrushesTouched,
  ): void {
    for (const peerIndex of subject.overlappingPeerIndices) {
      this.markOnePeer(
        prepared,
        subject,
        subjectIndex,
        peerIndex,
        hierarchy,
        preparedIndexToNodeIndex,
        boundsPad,
        membershipEpsilon,
        touched,
      );
    }
  }

  /**
   * Classifies one peer and marks it plus ancestors when it touches.
   *
   * @param prepared Prepared brushes.
   * @param subject Subject brush.
   * @param subjectIndex Subject index.
   * @param peerIndex Peer prepared index.
   * @param hierarchy Compact hierarchy.
   * @param preparedIndexToNodeIndex Prepared → hierarchy index map.
   * @param boundsPad Bounds pad.
   * @param membershipEpsilon Plane epsilon.
   * @param touched Touch map to fill.
   */
  private static markOnePeer(
    prepared: readonly PreparedBrush[],
    subject: PreparedBrush,
    subjectIndex: number,
    peerIndex: number,
    hierarchy: readonly SolidAlgorithmCompactNode[],
    preparedIndexToNodeIndex: ReadonlyMap<number, number>,
    boundsPad: number,
    membershipEpsilon: number,
    touched: SolidAlgorithmBrushesTouched,
  ): void {
    if (peerIndex === subjectIndex) {
      return;
    }
    const nodeIndex = preparedIndexToNodeIndex.get(peerIndex);
    if (nodeIndex === undefined) {
      return;
    }
    const type = SolidAlgorithmBrushIntersection.classify(subject, peerIndex, prepared, boundsPad, membershipEpsilon);
    if (
      type === SolidAlgorithmIntersectionType.NoIntersection ||
      type === SolidAlgorithmIntersectionType.InvalidValue
    ) {
      return;
    }
    touched.set(hierarchy[nodeIndex]!.nodeId, type);
    this.markAncestorChain(nodeIndex, hierarchy, touched);
  }

  /**
   * Marks every ancestor of a hierarchy index as Intersection.
   *
   * @param nodeIndex Child hierarchy index.
   * @param hierarchy Compact hierarchy.
   * @param touched Touch map to fill.
   */
  private static markAncestorChain(
    nodeIndex: number,
    hierarchy: readonly SolidAlgorithmCompactNode[],
    touched: SolidAlgorithmBrushesTouched,
  ): void {
    let parentIndex = this.findParentIndex(nodeIndex, hierarchy);
    while (parentIndex >= 0) {
      const parent = hierarchy[parentIndex]!;
      if (touched.get(parent.nodeId) === SolidAlgorithmIntersectionType.InvalidValue) {
        touched.set(parent.nodeId, SolidAlgorithmIntersectionType.Intersection);
      }
      parentIndex = this.findParentIndex(parentIndex, hierarchy);
    }
  }

  /**
   * Finds the parent branch index for a child hierarchy index.
   *
   * @param childIndex Child hierarchy index.
   * @param hierarchy Compact hierarchy.
   * @returns Parent index, or -1 for the root.
   */
  private static findParentIndex(childIndex: number, hierarchy: readonly SolidAlgorithmCompactNode[]): number {
    for (let index = 0; index < hierarchy.length; index++) {
      const node = hierarchy[index]!;
      if (node.kind !== 'branch' || node.childCount <= 0) {
        continue;
      }
      if (childIndex >= node.childOffset && childIndex < node.childOffset + node.childCount) {
        return index;
      }
    }
    return -1;
  }
}

/** Ensures the infinite inverted brush is marked when present. */
export function solidAlgorithmMarkInfiniteBrushTouch(
  hierarchy: readonly SolidAlgorithmCompactNode[],
  touched: SolidAlgorithmBrushesTouched,
): void {
  for (const node of hierarchy) {
    if (node.kind === 'brush' && node.preparedIndex === SOLID_ALGORITHM_INFINITE_PREPARED_INDEX) {
      touched.set(node.nodeId, SolidAlgorithmIntersectionType.AInsideB);
      return;
    }
  }
}
