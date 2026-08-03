import type { PreparedBrush } from '@/solid/algorithm/compile/solid_compile_types.js';
import type { SolidAlgorithmCompactNode } from './solid_algorithm_compact_node.js';
import { SOLID_ALGORITHM_INFINITE_PREPARED_INDEX } from './solid_algorithm_compact_node.js';
import { SolidAlgorithmBrushIntersection } from './solid_algorithm_brush_intersection.js';
import { SolidAlgorithmIntersectionType } from './solid_algorithm_intersection_type.js';

/** One spatial peer entry (Chisel BrushIntersection / BrushIntersectWith). */
export interface SolidAlgorithmBrushTouchPeer {
  /** Compact hierarchy node id of the peer brush. */
  nodeId: number;
  /** Prepared index of the peer brush. */
  preparedIndex: number;
  /** Intersection type from the subject's perspective. */
  type: SolidAlgorithmIntersectionType;
}

/**
 * Chisel BrushesTouchedByBrush for one processed subject. Built like
 * StoreBrushIntersectionsJob.SetUsedNodesBits: subject + root + subject
 * ancestors + each spatial peer with type + each peer's ancestors.
 */
export class SolidAlgorithmBrushesTouched {
  private readonly typeByNodeId = new Map<number, SolidAlgorithmIntersectionType>();
  private readonly spatialPeers: SolidAlgorithmBrushTouchPeer[] = [];

  /**
   * Returns the intersection type for a compact node id.
   *
   * @param nodeId Compact hierarchy node id.
   * @returns Intersection type, or InvalidValue when absent (Chisel bitset
   *   miss).
   */
  get(nodeId: number): SolidAlgorithmIntersectionType {
    return this.typeByNodeId.get(nodeId) ?? SolidAlgorithmIntersectionType.InvalidValue;
  }

  /**
   * Records an intersection type for a node id (Chisel
   * BrushIntersectionLookup.Set).
   *
   * @param nodeId Compact node id.
   * @param type Intersection type.
   */
  set(nodeId: number, type: SolidAlgorithmIntersectionType): void {
    this.typeByNodeId.set(nodeId, type);
  }

  /**
   * Returns spatial brush peers recorded for this subject (diagnostics/tests).
   *
   * @returns Peer touch list.
   */
  getSpatialPeers(): readonly SolidAlgorithmBrushTouchPeer[] {
    return this.spatialPeers;
  }

  /**
   * Builds BrushesTouchedByBrush for one subject (StoreBrushIntersectionsJob).
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
    const subjectNodeIndex = preparedIndexToNodeIndex.get(subjectIndex);
    if (subjectNodeIndex === undefined) {
      return touched;
    }
    const spatialPeers = this.findSpatialPeers(
      prepared,
      subjectIndex,
      hierarchy,
      preparedIndexToNodeIndex,
      boundsPad,
      membershipEpsilon,
    );
    for (const peer of spatialPeers) {
      touched.spatialPeers.push(peer);
    }
    this.setUsedNodesBits(hierarchy, subjectNodeIndex, spatialPeers, touched);
    return touched;
  }

  /**
   * Chisel SetUsedNodesBits: self, root, self-ancestors, each peer type, peer
   * ancestors.
   *
   * @param hierarchy Compact hierarchy.
   * @param subjectNodeIndex Hierarchy index of the subject brush.
   * @param spatialPeers Spatial touch peers.
   * @param touched Destination bitset map.
   */
  private static setUsedNodesBits(
    hierarchy: readonly SolidAlgorithmCompactNode[],
    subjectNodeIndex: number,
    spatialPeers: readonly SolidAlgorithmBrushTouchPeer[],
    touched: SolidAlgorithmBrushesTouched,
  ): void {
    const root = hierarchy[0]!;
    const subjectNode = hierarchy[subjectNodeIndex]!;
    touched.set(subjectNode.nodeId, SolidAlgorithmIntersectionType.Intersection);
    touched.set(root.nodeId, SolidAlgorithmIntersectionType.Intersection);
    this.setAncestorNodesIntersection(subjectNodeIndex, hierarchy, touched);
    for (const peer of spatialPeers) {
      touched.set(peer.nodeId, peer.type);
      const peerNodeIndex = this.findHierarchyIndexByNodeId(hierarchy, peer.nodeId);
      if (peerNodeIndex >= 0) {
        this.setAncestorNodesIntersection(peerNodeIndex, hierarchy, touched);
      }
    }
  }

  /**
   * Classifies the subject's precomputed bounds-overlap peers (Chisel
   * StoreBrushIntersectionsJob reads brushIntersectionsWith pairs only — it
   * does not re-scan the full brush list).
   *
   * @param prepared Prepared brushes.
   * @param subjectIndex Subject prepared index.
   * @param hierarchy Compact hierarchy.
   * @param preparedIndexToNodeIndex Prepared → hierarchy index.
   * @param boundsPad Bounds pad.
   * @param membershipEpsilon Plane epsilon.
   * @returns Spatial peers with subject-centric intersection types.
   */
  private static findSpatialPeers(
    prepared: readonly PreparedBrush[],
    subjectIndex: number,
    hierarchy: readonly SolidAlgorithmCompactNode[],
    preparedIndexToNodeIndex: ReadonlyMap<number, number>,
    boundsPad: number,
    membershipEpsilon: number,
  ): SolidAlgorithmBrushTouchPeer[] {
    const subject = prepared[subjectIndex]!;
    const peers: SolidAlgorithmBrushTouchPeer[] = [];
    for (const peerIndex of subject.overlappingPeerIndices) {
      if (peerIndex === subjectIndex) {
        continue;
      }
      const nodeIndex = preparedIndexToNodeIndex.get(peerIndex);
      if (nodeIndex === undefined) {
        continue;
      }
      const type = SolidAlgorithmBrushIntersection.classify(subject, peerIndex, prepared, boundsPad, membershipEpsilon);
      if (
        type === SolidAlgorithmIntersectionType.NoIntersection ||
        type === SolidAlgorithmIntersectionType.InvalidValue
      ) {
        continue;
      }
      peers.push({
        nodeId: hierarchy[nodeIndex]!.nodeId,
        preparedIndex: peerIndex,
        type,
      });
    }
    return peers;
  }

  /**
   * Sets every ancestor of a hierarchy node to Intersection (Chisel ancestor
   * walk in SetUsedNodesBits). Uses parentIndex for O(depth) walks.
   *
   * @param nodeIndex Child hierarchy index.
   * @param hierarchy Compact hierarchy.
   * @param touched Destination map.
   */
  private static setAncestorNodesIntersection(
    nodeIndex: number,
    hierarchy: readonly SolidAlgorithmCompactNode[],
    touched: SolidAlgorithmBrushesTouched,
  ): void {
    let parentIndex = hierarchy[nodeIndex]?.parentIndex ?? -1;
    while (parentIndex >= 0) {
      const parent = hierarchy[parentIndex];
      if (!parent) {
        return;
      }
      touched.set(parent.nodeId, SolidAlgorithmIntersectionType.Intersection);
      parentIndex = parent.parentIndex;
    }
  }

  /**
   * Maps prepared brush index → compact hierarchy index.
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
   * Finds hierarchy array index for a compact node id. With nodeId equal to
   * compact array index this is O(1).
   *
   * @param hierarchy Compact hierarchy.
   * @param nodeId Node id.
   * @returns Hierarchy index, or -1.
   */
  private static findHierarchyIndexByNodeId(hierarchy: readonly SolidAlgorithmCompactNode[], nodeId: number): number {
    if (nodeId >= 0 && nodeId < hierarchy.length && hierarchy[nodeId]!.nodeId === nodeId) {
      return nodeId;
    }
    for (let index = 0; index < hierarchy.length; index++) {
      if (hierarchy[index]!.nodeId === nodeId) {
        return index;
      }
    }
    return -1;
  }
}

/**
 * Marks the infinite inverted brush as AInsideB when present (subject inside
 * infinite solid).
 *
 * @param hierarchy Compact hierarchy.
 * @param touched Touch map to update.
 */
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
