import * as THREE from 'three';
import { SolidBrush } from '../brush/solid_brush.js';
import { SolidPlane } from '../brush/solid_plane.js';
import { SolidBrushInstance } from '../model/solid_brush_instance.js';
import { SolidOperation } from '../types/solid_operation.js';
import { SurfaceCategory } from '../types/surface_category.js';
import { shouldKeepSurfaceCategory, shouldReverseSurfaceWinding } from '../types/surface_category.js';
import { BrushMembership } from './brush_membership.js';
import { BrushOverlapGraph } from './brush_overlap_graph.js';
import { BrushShapeFingerprint } from './brush_shape_fingerprint.js';
import { BrushSpatialIndex } from './brush_spatial_index.js';
import { CategoryRouter } from './category_router.js';
import { SolidCompileCache } from './solid_compile_cache.js';
import { SolidCompiledPolygon } from './solid_compiled_polygon.js';
import { SOLID_FAT_PLANE_EPSILON } from './solid_math_constants.js';
import { SurfaceFragmentSplitter } from './surface_fragment_splitter.js';
import { SolidUpdateSetBuilder } from './solid_update_set.js';
import { forBatchesAsync } from '../../utils/async_yield.js';

export type { SolidCompiledPolygon } from './solid_compiled_polygon.js';

/** Options controlling full versus partial solid CSG compilation. */
export interface SolidCompileOptions {
  /**
   * Brush ids known to have changed. When set (and forceFull is false), only
   * those brushes and their spatial neighbors are recompiled.
   */
  dirtyBrushIds?: Iterable<string>;
  /** When true, discards reuse and recompiles every brush. */
  forceFull?: boolean;
  /**
   * When true, skips concatenating all cached polygons into one array. Solid
   * model meshing reads per-brush caches directly.
   */
  skipPolygonAssembly?: boolean;
}

/** Diagnostics from the most recent compile pass (for tests and profiling). */
export interface SolidCompileStats {
  /** True when every brush was recompiled. */
  fullRebuild: boolean;
  /** Number of brushes whose surfaces were regenerated. */
  recompiledBrushCount: number;
  /** Number of brushes that reused cached polygons. */
  reusedBrushCount: number;
  /** Visible brush count in the compile. */
  preparedBrushCount: number;
}

/** World-space brush snapshot used during compilation. */
interface PreparedBrush {
  instance: SolidBrushInstance;
  brush: SolidBrush;
  bounds: THREE.Box3;
  /** Indices of other prepared brushes whose bounds overlap this one. */
  overlappingPeerIndices: number[];
  operation: SolidOperation;
}

/**
 * Compiles solid brush instances into surface polygons using ordered
 * categorization, bounds-accelerated peer filtering, and partial updates so
 * only brushes affected by an edit are recompiled.
 */
export class SolidCsgCompiler {
  private readonly membershipEpsilon: number;
  private readonly boundsPad: number;
  private readonly cache = new SolidCompileCache();
  private readonly scratchCentroid = new THREE.Vector3();
  private readonly scratchOutside = new THREE.Vector3();
  private readonly scratchInside = new THREE.Vector3();
  private hasIntersectingOperations = false;
  private readonly refreshedBrushIds = new Set<string>();
  private lastUpdateBrushIds: string[] = [];
  private membershipIndex: BrushSpatialIndex | null = null;
  private lastStats: SolidCompileStats = {
    fullRebuild: true,
    recompiledBrushCount: 0,
    reusedBrushCount: 0,
    preparedBrushCount: 0,
  };

  /**
   * Creates a solid CSG compiler.
   *
   * @param membershipEpsilon Optional fat-plane epsilon for membership tests.
   */
  constructor(membershipEpsilon: number = SOLID_FAT_PLANE_EPSILON) {
    this.membershipEpsilon = membershipEpsilon;
    this.boundsPad = membershipEpsilon * 2;
  }

  /**
   * Returns diagnostics from the most recent compile.
   *
   * @returns Copy of the last compile stats.
   */
  getLastCompileStats(): SolidCompileStats {
    return { ...this.lastStats };
  }

  /**
   * Returns brush ids whose surfaces were recompiled on the last pass.
   *
   * @returns Brush ids that need mesh-chunk rebuild.
   */
  getLastUpdateBrushIds(): string[] {
    return this.lastUpdateBrushIds.slice();
  }

  /**
   * Returns the brush evaluation order from the last successful compile.
   *
   * @returns Ordered brush ids.
   */
  getLastBrushOrder(): string[] {
    return this.cache.getLastBrushOrder();
  }

  /**
   * Returns cached compiled polygons for one brush after compile.
   *
   * @param brushId Brush instance id.
   * @returns Polygon list or undefined.
   */
  getCachedPolygons(brushId: string): SolidCompiledPolygon[] | undefined {
    return this.cache.getPolygons(brushId);
  }

  /**
   * Returns previously overlapping peer ids for a brush from the last compile.
   *
   * @param brushId Brush instance id.
   * @returns Peer brush ids.
   */
  getCachedTouchPeerIds(brushId: string): string[] {
    return this.cache.getTouchPeerIds(brushId);
  }

  /**
   * Drops cached data for a removed brush.
   *
   * @param brushId Brush instance id.
   */
  invalidateBrush(brushId: string): void {
    this.cache.removeBrush(brushId);
  }

  /** Clears all compile caches (forces the next compile to rebuild everything). */
  clearCache(): void {
    this.cache.clear();
    this.lastUpdateBrushIds = [];
  }

  /**
   * Updates texture ids on cached polygons for a brush without recompiling CSG.
   * Used by presentation-only remesh after texture paint.
   *
   * @param brushId Brush instance id.
   * @param textureForSurface Maps surface index to texture id.
   * @returns True when a polygon cache exists and was updated.
   */
  updateCachedPolygonTextures(brushId: string, textureForSurface: (surfaceIndex: number) => string): boolean {
    const polygons = this.cache.getPolygons(brushId);
    if (!polygons) return false;
    for (const polygon of polygons) {
      polygon.textureId = textureForSurface(polygon.surfaceIndex);
    }
    return true;
  }

  /**
   * Compiles visible brushes into final surface polygons.
   *
   * @param instances Ordered brush instances (tree order = list order).
   * @param options Optional partial-update controls.
   * @returns Compiled surface polygons for meshing.
   */
  compile(instances: SolidBrushInstance[], options: SolidCompileOptions = {}): SolidCompiledPolygon[] {
    const prepared = this.beginCompile(instances, options);
    if (!prepared) return [];
    return this.compileWithCache(prepared, options, false);
  }

  /**
   * Compiles surfaces while yielding between brush batches so the UI can
   * update.
   *
   * @param instances Ordered brush instances.
   * @param options Compile options.
   * @param onProgress Optional 0..1 progress for the recompile phase.
   * @returns Assembled polygons unless skipPolygonAssembly is set.
   */
  async compileAsync(
    instances: SolidBrushInstance[],
    options: SolidCompileOptions = {},
    onProgress?: (ratio: number) => void,
  ): Promise<SolidCompiledPolygon[]> {
    const prepared = this.beginCompile(instances, options);
    if (!prepared) {
      onProgress?.(1);
      return [];
    }
    return this.compileWithCache(prepared, options, true, onProgress);
  }

  /**
   * Shared setup: prepare brushes, detect intersecting ops, build overlap
   * graph.
   *
   * @param instances Source instances.
   * @param options Compile options.
   * @returns Prepared list, or null when empty.
   */
  private beginCompile(instances: SolidBrushInstance[], options: SolidCompileOptions): PreparedBrush[] | null {
    this.refreshedBrushIds.clear();
    const prepared = this.prepareBrushes(instances, options);
    if (prepared.length === 0) {
      this.cache.clear();
      this.lastUpdateBrushIds = [];
      this.lastStats = {
        fullRebuild: true,
        recompiledBrushCount: 0,
        reusedBrushCount: 0,
        preparedBrushCount: 0,
      };
      return null;
    }
    this.hasIntersectingOperations = prepared.some((entry) => entry.operation === SolidOperation.Intersecting);
    this.buildOverlapGraph(prepared, options);
    this.membershipIndex = new BrushSpatialIndex(prepared, this.boundsPad);
    return prepared;
  }

  /**
   * Builds full or partial bounds-overlap adjacency for prepared brushes.
   *
   * @param prepared Prepared brushes with empty overlap lists.
   * @param options Compile options with optional dirty seeds.
   */
  private buildOverlapGraph(prepared: PreparedBrush[], options: SolidCompileOptions): void {
    const brushIds = prepared.map((entry) => entry.instance.id);
    if (this.shouldForceFullRebuild(brushIds, options)) {
      BrushOverlapGraph.build(prepared, this.boundsPad);
      return;
    }
    const seedIndices = this.resolveSeedIndices(prepared, options);
    if (seedIndices.size === 0 || seedIndices.size >= prepared.length) {
      BrushOverlapGraph.build(prepared, this.boundsPad);
      return;
    }
    const previousPeers = this.loadPreviousPeerIndices(prepared);
    BrushOverlapGraph.buildPartial(prepared, this.boundsPad, seedIndices, previousPeers);
  }

  /**
   * Maps dirty brush ids to prepared indices (including auto-refreshed ids).
   *
   * @param prepared Prepared brushes.
   * @param options Compile options.
   * @returns Seed index set.
   */
  private resolveSeedIndices(prepared: PreparedBrush[], options: SolidCompileOptions): Set<number> {
    const seedIds = this.collectSeedDirtyIds(options);
    const indices = new Set<number>();
    for (let index = 0; index < prepared.length; index++) {
      if (seedIds.has(prepared[index].instance.id)) {
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
  private loadPreviousPeerIndices(prepared: PreparedBrush[]): number[][] {
    const idToIndex = new Map<string, number>();
    for (let index = 0; index < prepared.length; index++) {
      idToIndex.set(prepared[index].instance.id, index);
    }
    return prepared.map((entry) => {
      const peerIds = this.cache.getTouchPeerIds(entry.instance.id);
      const peerIndices: number[] = [];
      for (const peerId of peerIds) {
        const peerIndex = idToIndex.get(peerId);
        if (peerIndex !== undefined) peerIndices.push(peerIndex);
      }
      return peerIndices;
    });
  }

  /**
   * Runs full or partial compilation against the persistent cache.
   *
   * @param prepared Prepared brushes in tree order.
   * @param options Compile options.
   * @param asyncRecompile When true, yields between recompile batches.
   * @param onProgress Optional progress for async recompile (0..1).
   * @returns Assembled polygon list.
   */
  private compileWithCache(
    prepared: PreparedBrush[],
    options: SolidCompileOptions,
    asyncRecompile: boolean,
    onProgress?: (ratio: number) => void,
  ): SolidCompiledPolygon[] | Promise<SolidCompiledPolygon[]> {
    const brushIds = prepared.map((entry) => entry.instance.id);
    const forceFull = this.shouldForceFullRebuild(brushIds, options);
    const updateSet = forceFull ? new Set(brushIds) : this.buildPartialUpdateSet(prepared, options);
    if (asyncRecompile) {
      return this.finishCompileAsync(prepared, options, forceFull, updateSet, brushIds, onProgress);
    }
    this.recompileUpdateSet(prepared, updateSet);
    this.finalizeCompileState(prepared, forceFull, updateSet, brushIds);
    if (options.skipPolygonAssembly) return [];
    return this.assemblePolygons(prepared);
  }

  /**
   * Async recompile path with browser yields between brush batches.
   *
   * @param prepared Prepared brushes.
   * @param options Compile options.
   * @param forceFull Whether this was a full rebuild.
   * @param updateSet Brush ids to recompile.
   * @param brushIds Prepared brush id order.
   * @param onProgress Optional progress callback.
   * @returns Assembled polygons (or empty when skipped).
   */
  private async finishCompileAsync(
    prepared: PreparedBrush[],
    options: SolidCompileOptions,
    forceFull: boolean,
    updateSet: Set<string>,
    brushIds: string[],
    onProgress?: (ratio: number) => void,
  ): Promise<SolidCompiledPolygon[]> {
    await this.recompileUpdateSetAsync(prepared, updateSet, onProgress);
    this.finalizeCompileState(prepared, forceFull, updateSet, brushIds);
    if (options.skipPolygonAssembly) return [];
    return this.assemblePolygons(prepared);
  }

  /**
   * Stores touch caches, order, stats after recompile.
   *
   * @param prepared Prepared brushes.
   * @param forceFull Full rebuild flag.
   * @param updateSet Recompiled brush ids.
   * @param brushIds Prepared order.
   */
  private finalizeCompileState(
    prepared: PreparedBrush[],
    forceFull: boolean,
    updateSet: Set<string>,
    brushIds: string[],
  ): void {
    this.storeTouchCaches(prepared);
    this.cache.pruneToIds(new Set(brushIds));
    this.cache.setLastBrushOrder(brushIds);
    this.lastUpdateBrushIds = Array.from(updateSet);
    this.recordCompileStats(forceFull, updateSet.size, prepared.length);
  }

  /**
   * Stores diagnostics for the completed compile pass.
   *
   * @param fullRebuild Whether every brush was recompiled.
   * @param recompiledBrushCount Brushes regenerated this pass.
   * @param preparedBrushCount Visible brush count.
   */
  private recordCompileStats(fullRebuild: boolean, recompiledBrushCount: number, preparedBrushCount: number): void {
    this.lastStats = {
      fullRebuild,
      recompiledBrushCount,
      reusedBrushCount: preparedBrushCount - recompiledBrushCount,
      preparedBrushCount,
    };
  }

  /**
   * Returns whether a full rebuild is required for this pass.
   *
   * @param brushIds Visible brush ids in order.
   * @param options Compile options.
   * @returns True when every brush must be recompiled.
   */
  private shouldForceFullRebuild(brushIds: string[], options: SolidCompileOptions): boolean {
    if (options.forceFull) return true;
    if (!options.dirtyBrushIds) return true;
    if (this.hasIntersectingOperations) return true;
    const seed = this.collectSeedDirtyIds(options);
    return !this.canReuseCachedBrushes(brushIds, seed);
  }

  /**
   * Collects seed dirty ids including brushes refreshed during prepare.
   *
   * @param options Compile options.
   * @returns Seed set for partial updates.
   */
  private collectSeedDirtyIds(options: SolidCompileOptions): Set<string> {
    const seed = new Set(options.dirtyBrushIds ?? []);
    for (const brushId of this.refreshedBrushIds) {
      seed.add(brushId);
    }
    return seed;
  }

  /**
   * Returns whether non-seed brushes can keep their cached polygons. Requires
   * cached output and stable relative tree order among reusable brushes.
   *
   * @param brushIds Current visible brush ids in order.
   * @param seedDirtyIds Brushes that will be recompiled.
   * @returns True when partial reuse is safe.
   */
  private canReuseCachedBrushes(brushIds: string[], seedDirtyIds: ReadonlySet<string>): boolean {
    const reusableIds = brushIds.filter((id) => !seedDirtyIds.has(id));
    for (const brushId of reusableIds) {
      if (!this.cache.getPolygons(brushId)) return false;
    }
    const reusableSet = new Set(reusableIds);
    const previousReusable = this.cache.getLastBrushOrder().filter((id) => reusableSet.has(id));
    if (previousReusable.length !== reusableIds.length) return false;
    for (let index = 0; index < reusableIds.length; index++) {
      if (previousReusable[index] !== reusableIds[index]) return false;
    }
    return true;
  }

  /**
   * Builds the partial recompile set from seed dirty ids and touch peers.
   *
   * @param prepared Prepared brushes.
   * @param options Compile options with dirty seeds.
   * @returns Brush ids to recompile.
   */
  private buildPartialUpdateSet(prepared: PreparedBrush[], options: SolidCompileOptions): Set<string> {
    const seed = this.collectSeedDirtyIds(options);
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
  private buildCurrentTouchMap(prepared: PreparedBrush[]): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (let index = 0; index < prepared.length; index++) {
      const entry = prepared[index];
      const peerIds = entry.overlappingPeerIndices.map((peerIndex) => prepared[peerIndex].instance.id);
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
  private buildPreviousTouchMap(brushIds: string[]): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const brushId of brushIds) {
      map.set(brushId, this.cache.getTouchPeerIds(brushId));
    }
    return map;
  }

  /**
   * Recompiles every brush in the update set and writes polygon cache entries.
   *
   * @param prepared All prepared brushes.
   * @param updateSet Brush ids to recompile.
   */
  private recompileUpdateSet(prepared: PreparedBrush[], updateSet: Set<string>): void {
    const indices = this.collectUpdateIndices(prepared, updateSet);
    for (const brushIndex of indices) {
      this.recompileOnePreparedBrush(prepared, brushIndex);
    }
  }

  /**
   * Recompiles update-set brushes in batches, yielding to the browser between
   * them.
   *
   * @param prepared All prepared brushes.
   * @param updateSet Brush ids to recompile.
   * @param onProgress Optional 0..1 progress.
   */
  private async recompileUpdateSetAsync(
    prepared: PreparedBrush[],
    updateSet: Set<string>,
    onProgress?: (ratio: number) => void,
  ): Promise<void> {
    const indices = this.collectUpdateIndices(prepared, updateSet);
    await forBatchesAsync(
      indices.length,
      20,
      (start, end) => {
        for (let i = start; i < end; i++) {
          this.recompileOnePreparedBrush(prepared, indices[i]);
        }
      },
      onProgress,
    );
  }

  /**
   * Lists prepared indices that belong to the update set (tree order).
   *
   * @param prepared Prepared brushes.
   * @param updateSet Brush ids to recompile.
   * @returns Indices into prepared.
   */
  private collectUpdateIndices(prepared: PreparedBrush[], updateSet: Set<string>): number[] {
    const indices: number[] = [];
    for (let brushIndex = 0; brushIndex < prepared.length; brushIndex++) {
      if (updateSet.has(prepared[brushIndex].instance.id)) {
        indices.push(brushIndex);
      }
    }
    return indices;
  }

  /**
   * Compiles surfaces for one prepared brush into the polygon cache.
   *
   * @param prepared All prepared brushes.
   * @param brushIndex Index of the brush to compile.
   */
  private recompileOnePreparedBrush(prepared: PreparedBrush[], brushIndex: number): void {
    const entry = prepared[brushIndex];
    const polygons: SolidCompiledPolygon[] = [];
    this.compileBrushSurfaces(prepared, brushIndex, polygons);
    this.cache.setPolygons(entry.instance.id, polygons);
  }

  /**
   * Writes current overlap peers into the persistent touch cache.
   *
   * @param prepared Prepared brushes after overlap build.
   */
  private storeTouchCaches(prepared: PreparedBrush[]): void {
    for (const entry of prepared) {
      const peerIds = entry.overlappingPeerIndices.map((peerIndex) => prepared[peerIndex].instance.id);
      this.cache.setTouchPeerIds(entry.instance.id, peerIds);
    }
  }

  /**
   * Concatenates cached polygons in tree order.
   *
   * @param prepared Prepared brushes in evaluation order.
   * @returns Full polygon soup for meshing.
   */
  private assemblePolygons(prepared: PreparedBrush[]): SolidCompiledPolygon[] {
    const output: SolidCompiledPolygon[] = [];
    for (const entry of prepared) {
      const cached = this.cache.getPolygons(entry.instance.id);
      if (!cached) continue;
      for (const polygon of cached) {
        output.push(polygon);
      }
    }
    return output;
  }

  /**
   * Transforms visible instances into model-space prepared brushes. Reuses
   * cached geometry for brushes not listed as dirty.
   *
   * @param instances Source instances.
   * @param options Compile options (dirty seeds).
   * @returns Prepared brush list.
   */
  private prepareBrushes(instances: SolidBrushInstance[], options: SolidCompileOptions): PreparedBrush[] {
    const dirtySeeds = options.forceFull ? null : options.dirtyBrushIds ? new Set(options.dirtyBrushIds) : null;
    const prepared: PreparedBrush[] = [];
    for (const instance of instances) {
      if (!instance.visible) continue;
      prepared.push(this.prepareOneBrush(instance, dirtySeeds));
    }
    return prepared;
  }

  /**
   * Prepares one brush, reusing cached model-space data when still valid.
   *
   * @param instance Source instance.
   * @param dirtySeeds Seed dirty ids, or null to force re-prepare.
   * @returns Prepared brush entry.
   */
  private prepareOneBrush(instance: SolidBrushInstance, dirtySeeds: Set<string> | null): PreparedBrush {
    const mustRefresh = dirtySeeds === null || dirtySeeds.has(instance.id) || !this.canReusePrepared(instance);
    if (!mustRefresh) {
      return this.preparedFromCache(instance);
    }
    this.refreshedBrushIds.add(instance.id);
    return this.prepareAndCacheBrush(instance);
  }

  /**
   * Returns whether cached prepared geometry still matches the instance.
   * Transform/op/visibility mismatches force a refresh. Shape fingerprints are
   * only checked when the transform matches so the hot path stays
   * allocation-free.
   *
   * @param instance Brush instance.
   * @returns True when cache is reusable.
   */
  private canReusePrepared(instance: SolidBrushInstance): boolean {
    const cached = this.cache.getPrepared(instance.id);
    if (!cached) return false;
    if (cached.operation !== instance.operation) return false;
    if (cached.visible !== instance.visible) return false;
    if (!cached.position.equals(instance.position)) return false;
    if (!this.eulerEquals(cached.rotation, instance.rotation)) return false;
    if (!cached.scale.equals(instance.scale)) return false;
    return true;
  }

  /**
   * Builds a prepared entry from the prepare cache.
   *
   * @param instance Brush instance.
   * @returns Prepared brush using cached geometry.
   */
  private preparedFromCache(instance: SolidBrushInstance): PreparedBrush {
    const cached = this.cache.getPrepared(instance.id)!;
    return {
      instance,
      brush: cached.brush,
      bounds: cached.bounds,
      overlappingPeerIndices: [],
      operation: instance.operation,
    };
  }

  /**
   * Transforms an instance into model space and stores the prepare cache entry.
   *
   * @param instance Brush instance.
   * @returns Fresh prepared brush.
   */
  private prepareAndCacheBrush(instance: SolidBrushInstance): PreparedBrush {
    const brush = instance.getModelSpaceBrush();
    const bounds = brush.computeLocalBounds();
    this.cache.setPrepared(instance.id, {
      brush,
      bounds: bounds.clone(),
      operation: instance.operation,
      position: instance.position.clone(),
      rotation: instance.rotation.clone(),
      scale: instance.scale.clone(),
      visible: instance.visible,
      shapeFingerprint: BrushShapeFingerprint.fromBrush(instance.brush),
    });
    return {
      instance,
      brush,
      bounds,
      overlappingPeerIndices: [],
      operation: instance.operation,
    };
  }

  /**
   * Compares two Euler rotations component-wise.
   *
   * @param a First rotation.
   * @param b Second rotation.
   * @returns True when all components match.
   */
  private eulerEquals(a: THREE.Euler, b: THREE.Euler): boolean {
    return a.x === b.x && a.y === b.y && a.z === b.z && a.order === b.order;
  }

  /**
   * Compiles all faces of one brush into the output list.
   *
   * @param prepared All prepared brushes.
   * @param brushIndex Index of the subject brush.
   * @param output Accumulator for compiled polygons.
   */
  private compileBrushSurfaces(prepared: PreparedBrush[], brushIndex: number, output: SolidCompiledPolygon[]): void {
    const subject = prepared[brushIndex];
    if (subject.overlappingPeerIndices.length === 0) {
      this.emitIsolatedBrushSurfaces(subject, prepared, brushIndex, output);
      return;
    }
    for (let faceIndex = 0; faceIndex < subject.brush.faces.length; faceIndex++) {
      this.compileBrushFace(prepared, brushIndex, faceIndex, output);
    }
  }

  /**
   * Compiles a single face of a brush into surface fragments.
   *
   * @param prepared All prepared brushes.
   * @param brushIndex Subject brush index.
   * @param faceIndex Face index on the subject brush.
   * @param output Polygon accumulator.
   */
  private compileBrushFace(
    prepared: PreparedBrush[],
    brushIndex: number,
    faceIndex: number,
    output: SolidCompiledPolygon[],
  ): void {
    const subject = prepared[brushIndex];
    const face = subject.brush.faces[faceIndex];
    const faceVertices = subject.brush.getFaceVertices(face);
    const facePlane = subject.brush.planes[faceIndex];
    const cutPlanes = this.collectCutPlanes(prepared, brushIndex, facePlane, faceVertices);
    const fragments =
      cutPlanes.length === 0 ? [faceVertices] : SurfaceFragmentSplitter.splitByPlanes(faceVertices, cutPlanes);
    for (const fragment of fragments) {
      const compiled = this.finalizeFragment(fragment, facePlane, face.surfaceIndex, subject, prepared, brushIndex);
      if (compiled) output.push(compiled);
    }
  }

  /**
   * Fast path for a brush that does not overlap any peer volume.
   *
   * @param subject Isolated brush.
   * @param prepared All brushes (for membership tests when needed).
   * @param brushIndex Subject index.
   * @param output Polygon accumulator.
   */
  private emitIsolatedBrushSurfaces(
    subject: PreparedBrush,
    prepared: PreparedBrush[],
    brushIndex: number,
    output: SolidCompiledPolygon[],
  ): void {
    if (subject.operation === SolidOperation.Subtractive) return;
    if (subject.operation === SolidOperation.Intersecting) return;
    if (!this.hasIntersectingOperations) {
      this.emitIsolatedAdditiveSurfacesDirect(subject, output);
      return;
    }
    this.emitIsolatedSurfacesWithMembership(subject, prepared, brushIndex, output);
  }

  /**
   * Emits isolated additive faces using full membership classification. Used
   * when intersecting operations exist elsewhere in the model.
   *
   * @param subject Isolated brush.
   * @param prepared All brushes.
   * @param brushIndex Subject index.
   * @param output Polygon accumulator.
   */
  private emitIsolatedSurfacesWithMembership(
    subject: PreparedBrush,
    prepared: PreparedBrush[],
    brushIndex: number,
    output: SolidCompiledPolygon[],
  ): void {
    for (let faceIndex = 0; faceIndex < subject.brush.faces.length; faceIndex++) {
      const face = subject.brush.faces[faceIndex];
      const compiled = this.finalizeFragment(
        subject.brush.getFaceVertices(face),
        subject.brush.planes[faceIndex],
        face.surfaceIndex,
        subject,
        prepared,
        brushIndex,
      );
      if (compiled) output.push(compiled);
    }
  }

  /**
   * Emits exterior faces of an isolated additive brush without membership
   * tests. Safe when the model has no intersecting operations.
   *
   * @param subject Isolated additive brush.
   * @param output Polygon accumulator.
   */
  private emitIsolatedAdditiveSurfacesDirect(subject: PreparedBrush, output: SolidCompiledPolygon[]): void {
    for (let faceIndex = 0; faceIndex < subject.brush.faces.length; faceIndex++) {
      const face = subject.brush.faces[faceIndex];
      const faceVertices = subject.brush.getFaceVertices(face);
      const facePlane = subject.brush.planes[faceIndex];
      if (faceVertices.length < 3) continue;
      output.push({
        vertices: faceVertices.map((point) => point.clone()),
        normal: facePlane.normal.clone(),
        surfaceIndex: face.surfaceIndex,
        brushId: subject.instance.id,
        textureId: subject.instance.getSurfaceTextureId(face.surfaceIndex),
        category: SurfaceCategory.SelfAligned,
      });
    }
  }

  /**
   * Collects planes from overlapping peer brushes that may cut the subject
   * face.
   *
   * @param prepared All brushes.
   * @param subjectIndex Subject brush index.
   * @param facePlane Subject face plane.
   * @returns Planes for fragment splitting.
   */
  private collectCutPlanes(
    prepared: PreparedBrush[],
    subjectIndex: number,
    facePlane: SolidPlane,
    faceVertices: THREE.Vector3[],
  ): SolidPlane[] {
    const planes: SolidPlane[] = [];
    const subject = prepared[subjectIndex];
    for (const peerIndex of subject.overlappingPeerIndices) {
      const peer = prepared[peerIndex];
      for (const plane of peer.brush.planes) {
        if (facePlane.isAlignedWith(plane) || facePlane.isReverseAlignedWith(plane)) {
          continue;
        }
        if (!this.planeLikelyCutsPolygon(faceVertices, plane)) continue;
        planes.push(plane);
      }
    }
    return planes;
  }

  /**
   * Returns whether a plane straddles a polygon (may produce a cut).
   *
   * @param polygon Face or fragment vertices.
   * @param plane Candidate cut plane.
   * @returns True when the plane may split the polygon.
   */
  private planeLikelyCutsPolygon(polygon: THREE.Vector3[], plane: SolidPlane): boolean {
    let sawInside = false;
    let sawOutside = false;
    for (const point of polygon) {
      const distance = plane.signedDistance(point);
      if (distance > this.membershipEpsilon) sawOutside = true;
      if (distance < -this.membershipEpsilon) sawInside = true;
      if (sawInside && sawOutside) return true;
    }
    return false;
  }

  /**
   * Classifies a fragment and emits a compiled polygon when it is a boundary.
   *
   * @param fragment Fragment vertices.
   * @param facePlane Original face plane.
   * @param surfaceIndex Face surface index.
   * @param subject Subject prepared brush.
   * @param prepared All brushes.
   * @param subjectIndex Subject index.
   * @returns Compiled polygon or null when discarded.
   */
  private finalizeFragment(
    fragment: THREE.Vector3[],
    facePlane: SolidPlane,
    surfaceIndex: number,
    subject: PreparedBrush,
    prepared: PreparedBrush[],
    subjectIndex: number,
  ): SolidCompiledPolygon | null {
    if (fragment.length < 3) return null;
    if (!this.isBoundaryFragment(fragment, facePlane.normal, prepared)) {
      return null;
    }
    const category = this.routeFragmentCategory(fragment, facePlane.normal, prepared, subjectIndex);
    if (!shouldKeepSurfaceCategory(category)) return null;
    return this.buildCompiledPolygon(fragment, facePlane, surfaceIndex, subject, category);
  }

  /**
   * Builds a compiled polygon from a kept fragment.
   *
   * @param fragment Fragment vertices.
   * @param facePlane Original face plane.
   * @param surfaceIndex Face surface index.
   * @param subject Subject prepared brush.
   * @param category Routed surface category.
   * @returns Compiled polygon.
   */
  private buildCompiledPolygon(
    fragment: THREE.Vector3[],
    facePlane: SolidPlane,
    surfaceIndex: number,
    subject: PreparedBrush,
    category: SurfaceCategory,
  ): SolidCompiledPolygon {
    const vertices = fragment.map((point) => point.clone());
    const normal = facePlane.normal.clone();
    if (shouldReverseSurfaceWinding(category)) {
      vertices.reverse();
      normal.negate();
    }
    return {
      vertices,
      normal,
      surfaceIndex,
      brushId: subject.instance.id,
      textureId: subject.instance.getSurfaceTextureId(surfaceIndex),
      category,
    };
  }

  /**
   * Routes a fragment's categories through brush operations in tree order.
   * Non-overlapping peers contribute Outside without a full plane classify.
   * When no intersecting ops exist, only self and overlapping peers are
   * routed.
   *
   * @param fragment Fragment polygon.
   * @param normal Face normal.
   * @param prepared All brushes.
   * @param subjectIndex Subject brush index.
   * @returns Final routed category.
   */
  private routeFragmentCategory(
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
   * Full tree-order routing including non-overlapping peers (intersecting ops).
   *
   * @param fragment Fragment polygon.
   * @param normal Face normal.
   * @param prepared All brushes.
   * @param subjectIndex Subject brush index.
   * @returns Final routed category.
   */
  private routeFragmentCategoryFull(
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
   * Local routing through self and overlapping peers only (additive/subtract).
   *
   * @param fragment Fragment polygon.
   * @param normal Face normal.
   * @param prepared All brushes.
   * @param subjectIndex Subject brush index.
   * @returns Final routed category.
   */
  private routeFragmentCategoryLocal(
    fragment: THREE.Vector3[],
    normal: THREE.Vector3,
    prepared: PreparedBrush[],
    subjectIndex: number,
  ): SurfaceCategory {
    let category = SurfaceCategory.Outside;
    const subject = prepared[subjectIndex];
    const relevant = subject.overlappingPeerIndices.concat(subjectIndex).sort((a, b) => a - b);
    for (const index of relevant) {
      const peer = prepared[index];
      const relative =
        index === subjectIndex
          ? SurfaceCategory.SelfAligned
          : BrushMembership.classifyPolygon(fragment, peer.brush, normal);
      category = CategoryRouter.route(category, relative, peer.operation);
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
  private relativeCategoryForPeer(
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
   * Double-checks boundary status with solid-membership samples across the
   * face.
   *
   * @param fragment Fragment vertices.
   * @param normal Face normal.
   * @param prepared All brushes.
   * @returns True when the fragment lies on the final solid boundary.
   */
  private isBoundaryFragment(fragment: THREE.Vector3[], normal: THREE.Vector3, prepared: PreparedBrush[]): boolean {
    this.computeCentroidInto(fragment, this.scratchCentroid);
    const offset = Math.max(this.membershipEpsilon * 4, 1e-4);
    this.scratchOutside.copy(this.scratchCentroid).addScaledVector(normal, offset);
    this.scratchInside.copy(this.scratchCentroid).addScaledVector(normal, -offset);
    const outsideInSolid = this.evaluateSolidMembership(this.scratchOutside, prepared);
    const insideInSolid = this.evaluateSolidMembership(this.scratchInside, prepared);
    return outsideInSolid !== insideInSolid;
  }

  /**
   * Evaluates the ordered CSG expression at a point. Additive/subtractive
   * models only test brushes whose bounds contain the point (spatial hash).
   * Intersecting ops still walk the full tree in order.
   *
   * @param point Sample point in model space.
   * @param prepared Brush list in tree order.
   * @returns True when the point is inside the final solid.
   */
  private evaluateSolidMembership(point: THREE.Vector3, prepared: PreparedBrush[]): boolean {
    if (this.hasIntersectingOperations) {
      return this.evaluateSolidMembershipFull(point, prepared);
    }
    return this.evaluateSolidMembershipLocal(point, prepared);
  }

  /**
   * Full tree-order membership including non-overlapping intersecting operands.
   *
   * @param point Sample point.
   * @param prepared Brush list.
   * @returns Solid membership.
   */
  private evaluateSolidMembershipFull(point: THREE.Vector3, prepared: PreparedBrush[]): boolean {
    let inside = false;
    for (const entry of prepared) {
      if (!this.boundsContainPoint(entry.bounds, point)) {
        inside = this.applyOperation(inside, false, entry.operation);
        continue;
      }
      const inBrush = BrushMembership.isInsidePlanes(point, entry.brush.planes, this.membershipEpsilon);
      inside = this.applyOperation(inside, inBrush, entry.operation);
    }
    return inside;
  }

  /**
   * Membership for additive/subtractive models using the spatial brush index.
   * Brushes that cannot contain the point never affect the result and are
   * skipped.
   *
   * @param point Sample point.
   * @param prepared Brush list.
   * @returns Solid membership.
   */
  private evaluateSolidMembershipLocal(point: THREE.Vector3, prepared: PreparedBrush[]): boolean {
    const candidates = this.membershipIndex
      ? this.membershipIndex.queryPoint(point)
      : this.collectContainingBrushIndices(point, prepared);
    if (candidates.length === 0) return false;
    candidates.sort((a, b) => a - b);
    let inside = false;
    for (const index of candidates) {
      const entry = prepared[index];
      const inBrush = BrushMembership.isInsidePlanes(point, entry.brush.planes, this.membershipEpsilon);
      inside = this.applyOperation(inside, inBrush, entry.operation);
    }
    return inside;
  }

  /**
   * Linear fallback that lists brushes whose bounds contain a point.
   *
   * @param point Sample point.
   * @param prepared Brush list.
   * @returns Prepared indices.
   */
  private collectContainingBrushIndices(point: THREE.Vector3, prepared: PreparedBrush[]): number[] {
    const indices: number[] = [];
    for (let index = 0; index < prepared.length; index++) {
      if (this.boundsContainPoint(prepared[index].bounds, point)) {
        indices.push(index);
      }
    }
    return indices;
  }

  /**
   * Applies a CSG operation to an accumulated membership flag.
   *
   * @param current Current solid membership.
   * @param inBrush Whether the point is inside the operand brush.
   * @param operation Operand operation.
   * @returns Updated membership.
   */
  private applyOperation(current: boolean, inBrush: boolean, operation: SolidOperation): boolean {
    if (operation === SolidOperation.Additive) return current || inBrush;
    if (operation === SolidOperation.Subtractive) return current && !inBrush;
    return current && inBrush;
  }

  /**
   * Returns whether a padded AABB contains a point.
   *
   * @param bounds Axis-aligned bounds.
   * @param point Sample point.
   * @returns True when the point is inside the expanded box.
   */
  private boundsContainPoint(bounds: THREE.Box3, point: THREE.Vector3): boolean {
    const pad = this.boundsPad;
    return (
      point.x >= bounds.min.x - pad &&
      point.x <= bounds.max.x + pad &&
      point.y >= bounds.min.y - pad &&
      point.y <= bounds.max.y + pad &&
      point.z >= bounds.min.z - pad &&
      point.z <= bounds.max.z + pad
    );
  }

  /**
   * Writes the arithmetic centroid of a polygon into a target vector.
   *
   * @param polygon Vertices.
   * @param target Output vector.
   */
  private computeCentroidInto(polygon: THREE.Vector3[], target: THREE.Vector3): void {
    target.set(0, 0, 0);
    for (const point of polygon) {
      target.add(point);
    }
    if (polygon.length > 0) {
      target.multiplyScalar(1 / polygon.length);
    }
  }
}
