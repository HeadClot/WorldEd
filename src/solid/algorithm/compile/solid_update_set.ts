import { SolidAlgorithmIntersectionType } from '@/solid/algorithm/routing/solid_algorithm_intersection_type.js';
import type { SolidCompileTouchPeer } from './solid_compile_cache.js';

/**
 * Builds the set of brushes that must be recompiled after an edit by expanding
 * seed dirty brushes with spatial neighbors that need surface updates.
 *
 * Matches Chisel InvalidateBrushesJob + pair-type surface semantics:
 *
 * - Intersection: CreateIntersectionLoops builds surface loops; both sides need
 *   rebuild (InvalidateBrushes expands every brushIntersections entry).
 * - BInsideA (peer inside seed): CreateRoutingTableJob emits AllOutside for the
 *   peer when processing the seed and AllInside when processing the peer; the
 *   inner peer's kept surfaces change and must recompile.
 * - AInsideB (seed inside peer): CreateRoutingTableJob emits AllInside for the
 *   peer node on the seed and AllOutside for the seed on the peer; the outer
 *   peer's surface loops are unchanged (CreateIntersectionLoops skips
 *   non-Intersection), so the outer peer is not force-recompiled.
 *
 * Intentionally one-hop: peers of peers are not recompiled.
 */
export class SolidUpdateSetBuilder {
  /**
   * Expands seed dirty brush ids into the full recompile set.
   *
   * @param seedDirtyIds Brushes known to have changed.
   * @param preparedBrushIds All visible brush ids in tree order.
   * @param currentTouchPeersByBrushId Current touch peers keyed by brush id.
   * @param previousTouchPeersByBrushId Previous touch peers keyed by brush id.
   * @returns Brush ids that need surface recompilation.
   */
  static build(
    seedDirtyIds: ReadonlySet<string>,
    preparedBrushIds: readonly string[],
    currentTouchPeersByBrushId: ReadonlyMap<string, readonly SolidCompileTouchPeer[]>,
    previousTouchPeersByBrushId: ReadonlyMap<string, readonly SolidCompileTouchPeer[]>,
  ): Set<string> {
    const preparedIdSet = new Set(preparedBrushIds);
    const updateSet = new Set<string>();
    for (const brushId of seedDirtyIds) {
      this.addSurfaceAffectingPeers(updateSet, previousTouchPeersByBrushId.get(brushId));
      if (!preparedIdSet.has(brushId)) {
        continue;
      }
      updateSet.add(brushId);
      this.addSurfaceAffectingPeers(updateSet, currentTouchPeersByBrushId.get(brushId));
    }
    return updateSet;
  }

  /**
   * Adds peers whose Chisel pair type requires a surface rebuild of that peer.
   *
   * @param updateSet Accumulator set.
   * @param peers Optional typed peer list from the seed's perspective.
   */
  private static addSurfaceAffectingPeers(
    updateSet: Set<string>,
    peers: readonly SolidCompileTouchPeer[] | undefined,
  ): void {
    if (!peers) {
      return;
    }
    for (const peer of peers) {
      if (this.peerNeedsSurfaceRebuild(peer.type)) {
        updateSet.add(peer.peerId);
      }
    }
  }

  /**
   * Returns whether a seed→peer IntersectionType forces the peer to recompile.
   * Chisel CreateRoutingTableJob: AInsideB → AllInside on peer node (outer
   * unchanged for loops); BInsideA → AllOutside (inner peer fully
   * recategorized); Intersection → Identity + loops.
   *
   * @param type Pair type from the seed brush's BrushesTouchedByBrush entry.
   * @returns True when the peer brush must be in the update set.
   */
  private static peerNeedsSurfaceRebuild(type: SolidAlgorithmIntersectionType): boolean {
    return type === SolidAlgorithmIntersectionType.Intersection || type === SolidAlgorithmIntersectionType.BInsideA;
  }
}
