import { BrushOverlapGraph } from './brush_overlap_graph.js';
import { SolidCompileCache } from './solid_compile_cache.js';
import type { PreparedBrush, SolidCompileOptions } from './solid_compile_types.js';
import { SolidUpdateSetBuilder } from './solid_update_set.js';

/**
 * Plans full versus partial solid CSG recompiles: overlap graphs, dirty seeds,
 * touch maps, and update sets.
 */
export class SolidCompilePlanner {
  private readonly cache: SolidCompileCache;
  private readonly boundsPad: number;

  /**
   * Creates a compile planner.
   *
   * @param cache Compile cache for touch peers and polygon reuse checks.
   * @param boundsPad Padding for bounds-overlap tests.
   */
  constructor(cache: SolidCompileCache, boundsPad: number) {
    this.cache = cache;
    this.boundsPad = boundsPad;
  }

  /**
   * Builds full or partial bounds-overlap adjacency for prepared brushes.
   *
   * @param prepared Prepared brushes with empty overlap lists.
   * @param options Compile options with optional dirty seeds.
   * @param hasIntersectingOperations Whether intersecting ops force full work.
   * @param refreshedBrushIds Brushes refreshed during prepare.
   */
  buildOverlapGraph(
    prepared: PreparedBrush[],
    options: SolidCompileOptions,
    hasIntersectingOperations: boolean,
    refreshedBrushIds: ReadonlySet<string>,
  ): void {
    const brushIds = prepared.map((entry) => entry.instance.id);
    if (this.shouldForceFullRebuild(brushIds, options, hasIntersectingOperations, refreshedBrushIds)) {
      BrushOverlapGraph.build(prepared, this.boundsPad);
      return;
    }
    this.buildPartialOrFullOverlapGraph(prepared, options, refreshedBrushIds);
  }

  /**
   * Maps dirty brush ids to prepared indices (including auto-refreshed ids).
   *
   * @param prepared Prepared brushes.
   * @param options Compile options.
   * @param refreshedBrushIds Brushes refreshed during prepare.
   * @returns Seed index set.
   */
  resolveSeedIndices(
    prepared: PreparedBrush[],
    options: SolidCompileOptions,
    refreshedBrushIds: ReadonlySet<string>,
  ): Set<number> {
    const seedIds = this.collectSeedDirtyIds(options, refreshedBrushIds);
    const indices = new Set<number>();
    for (let index = 0; index < prepared.length; index++) {
      if (seedIds.has(prepared[index]!.instance.id)) {
        indices.add(index);
      }
    }
    return indices;
  }

  /**
   * Loads previous overlap peer indices from the touch cache.
   *
   * @param prepared Prepared brushes.
   * @returns Peer index lists aligned with prepared order.
   */
  loadPreviousPeerIndices(prepared: PreparedBrush[]): number[][] {
    const idToIndex = this.buildIdToIndexMap(prepared);
    return prepared.map((entry) => this.mapPeerIdsToIndices(entry.instance.id, idToIndex));
  }

  /**
   * Returns whether a full rebuild is required for this pass. Intersecting
   * operations no longer force a full map recompile — partial touch expansion
   * plus full membership walks on the recompile set match Sander-style
   * iterative updates (only dirty brushes and their neighbors).
   *
   * @param brushIds Visible brush ids in order.
   * @param options Compile options.
   * @param hasIntersectingOperations Unused; kept for call-site compatibility.
   * @param refreshedBrushIds Brushes refreshed during prepare.
   * @returns True when every brush must be recompiled.
   */
  shouldForceFullRebuild(
    brushIds: string[],
    options: SolidCompileOptions,
    hasIntersectingOperations: boolean,
    refreshedBrushIds: ReadonlySet<string>,
  ): boolean {
    void hasIntersectingOperations;
    if (options.forceFull) return true;
    if (!options.dirtyBrushIds) return true;
    const seed = this.collectSeedDirtyIds(options, refreshedBrushIds);
    return !this.canReuseCachedBrushes(brushIds, seed);
  }

  /**
   * Collects seed dirty ids including brushes refreshed during prepare.
   *
   * @param options Compile options.
   * @param refreshedBrushIds Brushes refreshed during prepare.
   * @returns Seed set for partial updates.
   */
  collectSeedDirtyIds(options: SolidCompileOptions, refreshedBrushIds: ReadonlySet<string>): Set<string> {
    const seed = new Set(options.dirtyBrushIds ?? []);
    for (const brushId of refreshedBrushIds) {
      seed.add(brushId);
    }
    return seed;
  }

  /**
   * Returns whether non-seed brushes can keep their cached polygons.
   *
   * @param brushIds Current visible brush ids in order.
   * @param seedDirtyIds Brushes that will be recompiled.
   * @returns True when partial reuse is safe.
   */
  canReuseCachedBrushes(brushIds: string[], seedDirtyIds: ReadonlySet<string>): boolean {
    const reusableIds = brushIds.filter((id) => !seedDirtyIds.has(id));
    if (!this.allReusableHavePolygons(reusableIds)) return false;
    return this.reusableOrderMatchesCache(reusableIds);
  }

  /**
   * Builds the partial recompile set from seed dirty ids and touch peers.
   *
   * @param prepared Prepared brushes.
   * @param options Compile options with dirty seeds.
   * @param refreshedBrushIds Brushes refreshed during prepare.
   * @returns Brush ids to recompile.
   */
  buildPartialUpdateSet(
    prepared: PreparedBrush[],
    options: SolidCompileOptions,
    refreshedBrushIds: ReadonlySet<string>,
  ): Set<string> {
    const seed = this.collectSeedDirtyIds(options, refreshedBrushIds);
    const brushIds = prepared.map((entry) => entry.instance.id);
    const currentTouches = this.buildCurrentTouchMap(prepared);
    const previousTouches = this.buildPreviousTouchMap(brushIds);
    return SolidUpdateSetBuilder.build(seed, brushIds, currentTouches, previousTouches);
  }

  /**
   * Builds current overlap adjacency keyed by brush id.
   *
   * @param prepared Prepared brushes with overlap indices.
   * @returns Map of brush id to peer ids.
   */
  buildCurrentTouchMap(prepared: PreparedBrush[]): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (let index = 0; index < prepared.length; index++) {
      const entry = prepared[index]!;
      const peerIds = entry.overlappingPeerIndices.map((peerIndex) => prepared[peerIndex]!.instance.id);
      map.set(entry.instance.id, peerIds);
    }
    return map;
  }

  /**
   * Loads previous touch peers for the given brush ids from cache.
   *
   * @param brushIds Brush ids to look up.
   * @returns Map of brush id to previous peer ids.
   */
  buildPreviousTouchMap(brushIds: string[]): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const brushId of brushIds) {
      map.set(brushId, this.cache.getTouchPeerIds(brushId));
    }
    return map;
  }

  /**
   * Builds partial overlap when seeds are small, otherwise full overlap.
   *
   * @param prepared Prepared brushes.
   * @param options Compile options.
   * @param refreshedBrushIds Brushes refreshed during prepare.
   */
  private buildPartialOrFullOverlapGraph(
    prepared: PreparedBrush[],
    options: SolidCompileOptions,
    refreshedBrushIds: ReadonlySet<string>,
  ): void {
    const seedIndices = this.resolveSeedIndices(prepared, options, refreshedBrushIds);
    if (seedIndices.size === 0 || seedIndices.size >= prepared.length) {
      BrushOverlapGraph.build(prepared, this.boundsPad);
      return;
    }
    const previousPeers = this.loadPreviousPeerIndices(prepared);
    BrushOverlapGraph.buildPartial(prepared, this.boundsPad, seedIndices, previousPeers);
  }

  /**
   * Builds a map from brush id to prepared index.
   *
   * @param prepared Prepared brushes.
   * @returns Id-to-index map.
   */
  private buildIdToIndexMap(prepared: PreparedBrush[]): Map<string, number> {
    const idToIndex = new Map<string, number>();
    for (let index = 0; index < prepared.length; index++) {
      idToIndex.set(prepared[index]!.instance.id, index);
    }
    return idToIndex;
  }

  /**
   * Maps cached peer ids for one brush onto prepared indices.
   *
   * @param brushId Brush instance id.
   * @param idToIndex Id-to-index map for the prepared list.
   * @returns Peer indices present in the prepared list.
   */
  private mapPeerIdsToIndices(brushId: string, idToIndex: Map<string, number>): number[] {
    const peerIds = this.cache.getTouchPeerIds(brushId);
    const peerIndices: number[] = [];
    for (const peerId of peerIds) {
      const peerIndex = idToIndex.get(peerId);
      if (peerIndex !== undefined) peerIndices.push(peerIndex);
    }
    return peerIndices;
  }

  /**
   * Returns whether every reusable brush has cached polygons.
   *
   * @param reusableIds Brush ids that would reuse cache.
   * @returns True when all have polygon entries.
   */
  private allReusableHavePolygons(reusableIds: string[]): boolean {
    for (const brushId of reusableIds) {
      if (!this.cache.getPolygons(brushId)) return false;
    }
    return true;
  }

  /**
   * Returns whether reusable brush order matches the previous compile order.
   *
   * @param reusableIds Current reusable ids in tree order.
   * @returns True when relative order is stable.
   */
  private reusableOrderMatchesCache(reusableIds: string[]): boolean {
    const reusableSet = new Set(reusableIds);
    const previousReusable = this.cache.getLastBrushOrder().filter((id) => reusableSet.has(id));
    if (previousReusable.length !== reusableIds.length) return false;
    for (let index = 0; index < reusableIds.length; index++) {
      if (previousReusable[index] !== reusableIds[index]) return false;
    }
    return true;
  }
}
