import * as THREE from 'three';
import { SolidBrush } from '../brush/solid_brush.js';
import { SolidOperation } from '../types/solid_operation.js';
import { SolidCompiledPolygon } from './solid_compiled_polygon.js';

/** Cached model-space brush geometry reused between partial compiles. */
export interface CachedPreparedBrush {
  /** Model-space brush clone. */
  brush: SolidBrush;
  /** Axis-aligned bounds of the model-space brush. */
  bounds: THREE.Box3;
  /** CSG operation at the time of caching. */
  operation: SolidOperation;
  /** Local position snapshot. */
  position: THREE.Vector3;
  /** Local rotation snapshot. */
  rotation: THREE.Euler;
  /** Local scale snapshot. */
  scale: THREE.Vector3;
  /** Visibility snapshot. */
  visible: boolean;
  /** Topology fingerprint for shape change detection. */
  shapeFingerprint: string;
}

/**
 * Stores per-brush compiled polygons, touch peers, and prepared geometry so
 * only brushes affected by an edit need to be recompiled.
 */
export class SolidCompileCache {
  private readonly polygonsByBrushId = new Map<string, SolidCompiledPolygon[]>();
  private readonly touchIdsByBrushId = new Map<string, string[]>();
  private readonly preparedByBrushId = new Map<string, CachedPreparedBrush>();
  private lastBrushOrder: string[] = [];

  /** Clears every cached entry (full rebuild baseline). */
  clear(): void {
    this.polygonsByBrushId.clear();
    this.touchIdsByBrushId.clear();
    this.preparedByBrushId.clear();
    this.lastBrushOrder = [];
  }

  /**
   * Returns whether every listed brush has compiled polygon output cached.
   *
   * @param brushIds Brush instance ids in tree order.
   * @returns True when all ids have polygon cache entries.
   */
  hasPolygonsForAll(brushIds: string[]): boolean {
    for (const brushId of brushIds) {
      if (!this.polygonsByBrushId.has(brushId)) return false;
    }
    return brushIds.length > 0 || this.polygonsByBrushId.size === 0;
  }

  /**
   * Returns cached compiled polygons for a brush.
   *
   * @param brushId Brush instance id.
   * @returns Polygon list or undefined when missing.
   */
  getPolygons(brushId: string): SolidCompiledPolygon[] | undefined {
    return this.polygonsByBrushId.get(brushId);
  }

  /**
   * Stores compiled polygons for a brush.
   *
   * @param brushId Brush instance id.
   * @param polygons Final surface polygons for that brush.
   */
  setPolygons(brushId: string, polygons: SolidCompiledPolygon[]): void {
    this.polygonsByBrushId.set(brushId, polygons);
  }

  /**
   * Returns previously overlapping peer brush ids.
   *
   * @param brushId Brush instance id.
   * @returns Peer ids (empty when unknown).
   */
  getTouchPeerIds(brushId: string): string[] {
    return this.touchIdsByBrushId.get(brushId)?.slice() ?? [];
  }

  /**
   * Stores the set of peer brushes that currently overlap a brush.
   *
   * @param brushId Brush instance id.
   * @param peerIds Overlapping peer instance ids.
   */
  setTouchPeerIds(brushId: string, peerIds: string[]): void {
    this.touchIdsByBrushId.set(brushId, peerIds.slice());
  }

  /**
   * Returns cached prepared model-space geometry.
   *
   * @param brushId Brush instance id.
   * @returns Prepared snapshot or undefined.
   */
  getPrepared(brushId: string): CachedPreparedBrush | undefined {
    return this.preparedByBrushId.get(brushId);
  }

  /**
   * Stores prepared model-space geometry for reuse.
   *
   * @param brushId Brush instance id.
   * @param prepared Prepared snapshot.
   */
  setPrepared(brushId: string, prepared: CachedPreparedBrush): void {
    this.preparedByBrushId.set(brushId, prepared);
  }

  /**
   * Drops all cache entries for one brush (removal or full invalidation).
   *
   * @param brushId Brush instance id to drop.
   */
  removeBrush(brushId: string): void {
    this.polygonsByBrushId.delete(brushId);
    this.touchIdsByBrushId.delete(brushId);
    this.preparedByBrushId.delete(brushId);
  }

  /**
   * Removes cache entries for brushes no longer present in the model.
   *
   * @param activeIds Set of brush ids still in the model.
   */
  pruneToIds(activeIds: Set<string>): void {
    this.pruneMapKeys(this.polygonsByBrushId, activeIds);
    this.pruneMapKeys(this.touchIdsByBrushId, activeIds);
    this.pruneMapKeys(this.preparedByBrushId, activeIds);
  }

  /**
   * Returns the brush evaluation order from the last successful compile.
   *
   * @returns Ordered brush ids.
   */
  getLastBrushOrder(): string[] {
    return this.lastBrushOrder.slice();
  }

  /**
   * Records brush evaluation order after a compile.
   *
   * @param order Ordered brush ids.
   */
  setLastBrushOrder(order: string[]): void {
    this.lastBrushOrder = order.slice();
  }

  /**
   * Returns whether the given order matches the last compiled order.
   *
   * @param order Candidate ordered brush ids.
   * @returns True when sequences are identical.
   */
  orderMatches(order: string[]): boolean {
    if (order.length !== this.lastBrushOrder.length) return false;
    for (let index = 0; index < order.length; index++) {
      if (order[index] !== this.lastBrushOrder[index]) return false;
    }
    return true;
  }

  /**
   * Deletes map keys that are not in the active set.
   *
   * @param map Map to prune.
   * @param activeIds Retained keys.
   */
  private pruneMapKeys<T>(map: Map<string, T>, activeIds: Set<string>): void {
    for (const key of map.keys()) {
      if (!activeIds.has(key)) map.delete(key);
    }
  }
}
