import type { PreparedBrush } from '@/solid/algorithm/compile/solid_compile_types.js';

/**
 * Selects which touch peers enter a subject's Sander/Chisel routing table.
 *
 * Matches CreateRoutingTableJob / brushesTouchedByBrush locality: only brushes
 * whose volumes overlap the subject enter that subject's table, in evaluation
 * order. Later intersecting peers are included for every subject so a hull ∩
 * clips subtractive room walls and additive details the same way (RealtimeCSG
 * inverted world = infinite solid first, then ordered ops, peer-local tables).
 */
export class SolidAlgorithmRoutingPeers {
  /**
   * Builds the ordered prepared indices for one subject's flat routing table.
   *
   * @param prepared All prepared brushes in evaluation order.
   * @param subjectIndex Subject prepared index.
   * @param peerIndices Overlapping peer indices (excluding subject).
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
   * Returns whether a peer index should appear in the subject's routing table.
   * All spatial touch peers are included (Chisel brushesTouchedByBrush).
   *
   * @param _prepared Prepared brushes (unused; kept for call-site stability).
   * @param _subjectIndex Subject index (unused).
   * @param peerIndex Peer index.
   * @returns True for every finite peer index (caller already filtered
   *   touches).
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
