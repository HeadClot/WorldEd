import type { PreparedBrush } from '@/solid/algorithm/compile/solid_compile_types.js';

/**
 * Selects which touch peers enter a subject's routing surfaces (cut planes).
 * Spatial peers only — Chisel brushesTouchedByBrush / CreateIntersectionLoops
 * locality. Routing tables themselves are built by CreateRoutingTableJob from
 * the same spatial touch map.
 */
export class SolidAlgorithmRoutingPeers {
  /**
   * Builds the ordered prepared indices for one subject's local peer set.
   *
   * @param prepared All prepared brushes in evaluation order.
   * @param subjectIndex Subject prepared index.
   * @param peerIndices Spatial peer indices (excluding subject).
   * @returns Subject + touch peers in prepared order.
   */
  static orderedIndicesForSubject(
    prepared: readonly PreparedBrush[],
    subjectIndex: number,
    peerIndices: readonly number[],
  ): number[] {
    if (!prepared[subjectIndex]) {
      return [];
    }
    const relevant = new Set<number>(peerIndices);
    relevant.add(subjectIndex);
    return this.filterPreparedOrder(prepared.length, relevant);
  }

  /**
   * Returns whether a peer index may contribute cut planes for a subject face.
   * Caller supplies spatial touch peers only.
   *
   * @param _prepared Prepared brushes (unused; call-site stability).
   * @param _subjectIndex Subject index (unused).
   * @param peerIndex Peer index.
   * @returns True for every finite peer index.
   */
  static peerBelongsInSubjectTable(
    _prepared: readonly PreparedBrush[],
    _subjectIndex: number,
    peerIndex: number,
  ): boolean {
    void _prepared;
    void _subjectIndex;
    return Number.isFinite(peerIndex);
  }

  /**
   * Filters prepared order to the relevant set.
   *
   * @param preparedCount Total prepared count.
   * @param relevant Relevant indices.
   * @returns Ordered indices.
   */
  private static filterPreparedOrder(preparedCount: number, relevant: ReadonlySet<number>): number[] {
    const ordered: number[] = [];
    for (let index = 0; index < preparedCount; index++) {
      if (relevant.has(index)) {
        ordered.push(index);
      }
    }
    return ordered;
  }
}
