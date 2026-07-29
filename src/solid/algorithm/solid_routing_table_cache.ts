import type { PreparedBrush } from './solid_compile_types.js';
import type { SolidCsgTree } from './solid_csg_tree.js';
import { SolidRoutingTable } from './solid_routing_table.js';
import { SolidRoutingTableBuilder } from './solid_routing_table_builder.js';

/**
 * Caches per-subject flat routing tables. Cache keys include brush ids (and
 * evaluation order) so insert/delete cannot reuse a table whose step indices
 * still point at the wrong brushes after prepared indices shift.
 *
 * Hierarchical CSG does not use these tables; the builder returns an empty
 * table when the tree is not flat.
 */
export class SolidRoutingTableCache {
  private readonly tablesBySubjectId = new Map<string, SolidRoutingTable>();
  private readonly keyBySubjectId = new Map<string, string>();

  /** Clears all cached tables. */
  clear(): void {
    this.tablesBySubjectId.clear();
    this.keyBySubjectId.clear();
  }

  /**
   * Returns a routing table for the subject, building and caching when needed.
   * Hierarchical (non-flat) trees produce an empty table from the builder.
   *
   * @param prepared Prepared brushes.
   * @param subjectIndex Subject prepared index.
   * @param tree CSG tree (flat for real tables).
   * @param invertedWorld Whether CSG starts solid.
   * @param forceFull Whether flat tables include every brush (sequential ∩).
   * @returns Routing table for the subject.
   */
  getOrBuild(
    prepared: readonly PreparedBrush[],
    subjectIndex: number,
    tree: SolidCsgTree,
    invertedWorld: boolean,
    forceFull: boolean,
  ): SolidRoutingTable {
    const subject = prepared[subjectIndex];
    if (!subject) {
      return new SolidRoutingTable([], invertedWorld);
    }
    const peerIndices = subject.overlappingPeerIndices;
    const cacheKey = this.buildCacheKey(prepared, subjectIndex, peerIndices, invertedWorld, forceFull, tree.isFlat);
    const existingKey = this.keyBySubjectId.get(subject.instance.id);
    const existing = this.tablesBySubjectId.get(subject.instance.id);
    if (existing && existingKey === cacheKey) {
      return existing;
    }
    const table = SolidRoutingTableBuilder.buildForSubject(
      prepared,
      subjectIndex,
      peerIndices,
      tree,
      invertedWorld,
      forceFull,
    );
    this.tablesBySubjectId.set(subject.instance.id, table);
    this.keyBySubjectId.set(subject.instance.id, cacheKey);
    return table;
  }

  /**
   * Drops the cached table for one brush. Also clears every table because a
   * removal or reorder shifts prepared indices used inside other tables.
   *
   * @param _brushId Brush instance id (unused; full clear is required).
   */
  invalidateBrush(_brushId: string): void {
    void _brushId;
    this.clear();
  }

  /**
   * Builds a cache key from subject/peer brush ids, prepared indices, operation
   * codes, and mode flags so both identity and list-order changes invalidate.
   *
   * @param prepared Prepared brushes.
   * @param subjectIndex Subject prepared index.
   * @param peerIndices Peer prepared indices.
   * @param invertedWorld Inverted-world flag.
   * @param forceFull Full-walk flag.
   * @param isFlat Tree flatness.
   * @returns Cache key string.
   */
  private buildCacheKey(
    prepared: readonly PreparedBrush[],
    subjectIndex: number,
    peerIndices: readonly number[],
    invertedWorld: boolean,
    forceFull: boolean,
    isFlat: boolean,
  ): string {
    const subject = prepared[subjectIndex];
    if (!subject) return 'missing';
    const parts: string[] = [
      subject.instance.id,
      invertedWorld ? '1' : '0',
      forceFull ? '1' : '0',
      isFlat ? '1' : '0',
      `si:${subjectIndex}`,
      `so:${subject.operation}`,
    ];
    if (forceFull) {
      for (let index = 0; index < prepared.length; index++) {
        const entry = prepared[index];
        if (!entry) continue;
        parts.push(`${index}:${entry.instance.id}:${entry.operation}`);
      }
      return parts.join('|');
    }
    const orderedPeers = peerIndices.slice().sort((left, right) => left - right);
    for (const peerIndex of orderedPeers) {
      const entry = prepared[peerIndex];
      if (!entry) continue;
      parts.push(`p:${peerIndex}:${entry.instance.id}:${entry.operation}`);
    }
    return parts.join('|');
  }
}
