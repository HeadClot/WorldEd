import * as THREE from 'three';
import { SolidBrushInstance } from '../model/solid_brush_instance.js';
import { BrushShapeFingerprint } from './brush_shape_fingerprint.js';
import { SolidCompileCache } from './solid_compile_cache.js';
import type { PreparedBrush, SolidCompileOptions } from './solid_compile_types.js';

/**
 * Transforms visible brush instances into prepared model-space snapshots,
 * reusing cache entries when transforms and operations are unchanged.
 */
export class SolidBrushPreparer {
  private readonly cache: SolidCompileCache;
  private readonly refreshedBrushIds = new Set<string>();

  /**
   * Creates a brush preparer.
   *
   * @param cache Compile cache storing prepared geometry.
   */
  constructor(cache: SolidCompileCache) {
    this.cache = cache;
  }

  /**
   * Returns brush ids refreshed during the most recent prepare pass.
   *
   * @returns Set of refreshed brush ids.
   */
  getRefreshedBrushIds(): ReadonlySet<string> {
    return this.refreshedBrushIds;
  }

  /** Clears the set of brushes refreshed on the last prepare pass. */
  clearRefreshedBrushIds(): void {
    this.refreshedBrushIds.clear();
  }

  /**
   * Transforms visible instances into model-space prepared brushes.
   *
   * @param instances Source instances.
   * @param options Compile options (dirty seeds).
   * @returns Prepared brush list.
   */
  prepareBrushes(instances: SolidBrushInstance[], options: SolidCompileOptions): PreparedBrush[] {
    const dirtySeeds = this.resolveDirtySeeds(options);
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
  prepareOneBrush(instance: SolidBrushInstance, dirtySeeds: Set<string> | null): PreparedBrush {
    const mustRefresh = dirtySeeds === null || dirtySeeds.has(instance.id) || !this.canReusePrepared(instance);
    if (!mustRefresh) {
      return this.preparedFromCache(instance);
    }
    this.refreshedBrushIds.add(instance.id);
    return this.prepareAndCacheBrush(instance);
  }

  /**
   * Returns whether cached prepared geometry still matches the instance.
   *
   * @param instance Brush instance.
   * @returns True when cache is reusable.
   */
  canReusePrepared(instance: SolidBrushInstance): boolean {
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
  preparedFromCache(instance: SolidBrushInstance): PreparedBrush {
    const cached = this.cache.getPrepared(instance.id);
    if (!cached) {
      return this.prepareAndCacheBrush(instance);
    }
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
  prepareAndCacheBrush(instance: SolidBrushInstance): PreparedBrush {
    const brush = instance.getModelSpaceBrush();
    const bounds = brush.computeLocalBounds();
    this.storePreparedCacheEntry(instance, brush, bounds);
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
  eulerEquals(a: THREE.Euler, b: THREE.Euler): boolean {
    return a.x === b.x && a.y === b.y && a.z === b.z && a.order === b.order;
  }

  /**
   * Resolves dirty seed set for prepare, or null to force full re-prepare.
   *
   * @param options Compile options.
   * @returns Dirty seed set, or null when every brush must refresh.
   */
  private resolveDirtySeeds(options: SolidCompileOptions): Set<string> | null {
    if (options.forceFull) return null;
    if (!options.dirtyBrushIds) return null;
    return new Set(options.dirtyBrushIds);
  }

  /**
   * Writes a prepared geometry snapshot into the compile cache.
   *
   * @param instance Source instance.
   * @param brush Model-space brush.
   * @param bounds Model-space bounds.
   */
  private storePreparedCacheEntry(
    instance: SolidBrushInstance,
    brush: PreparedBrush['brush'],
    bounds: THREE.Box3,
  ): void {
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
  }
}
