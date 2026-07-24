/**
 * Builds the set of brushes that must be recompiled after an edit by expanding
 * seed dirty brushes with their previous and current spatial neighbors only.
 *
 * Intentionally one-hop: peers of peers are not recompiled. A large world brush
 * that touches every solid would otherwise force a full-map CSG on every move.
 * Cross-brush T-junction welding is handled separately on the recompile set.
 */
export class SolidUpdateSetBuilder {
  /**
   * Expands seed dirty brush ids into the full recompile set.
   * Includes brushes that previously touched a seed and brushes that touch a
   * seed under the current overlap graph (direct neighbors only).
   * @param seedDirtyIds Brushes known to have changed.
   * @param preparedBrushIds All visible brush ids in tree order.
   * @param currentTouchIdsByBrushId Current overlap peers keyed by brush id.
   * @param previousTouchIdsByBrushId Previous overlap peers keyed by brush id.
   * @returns Brush ids that need surface recompilation.
   */
  static build(
    seedDirtyIds: ReadonlySet<string>,
    preparedBrushIds: readonly string[],
    currentTouchIdsByBrushId: ReadonlyMap<string, readonly string[]>,
    previousTouchIdsByBrushId: ReadonlyMap<string, readonly string[]>,
  ): Set<string> {
    const preparedIdSet = new Set(preparedBrushIds);
    const updateSet = new Set<string>();
    for (const brushId of seedDirtyIds) {
      // Hidden/removed seeds still expand previous peers so neighbors recompile.
      this.addPeers(updateSet, previousTouchIdsByBrushId.get(brushId));
      if (!preparedIdSet.has(brushId)) continue;
      updateSet.add(brushId);
      this.addPeers(updateSet, currentTouchIdsByBrushId.get(brushId));
    }
    return updateSet;
  }

  /**
   * Adds peer ids into the update set when defined.
   * @param updateSet Accumulator set.
   * @param peerIds Optional peer list.
   */
  private static addPeers(updateSet: Set<string>, peerIds: readonly string[] | undefined): void {
    if (!peerIds) return;
    for (const peerId of peerIds) {
      updateSet.add(peerId);
    }
  }
}
