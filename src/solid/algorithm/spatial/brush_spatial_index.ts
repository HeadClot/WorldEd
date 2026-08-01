import * as THREE from 'three';
import { packSpatialCellKey } from './spatial_cell_key.js';

/** Bounds entry stored in the uniform spatial grid. */
export interface SpatialBoundsEntry {
  /** Axis-aligned bounds in model space. */
  bounds: THREE.Box3;
}

/**
 * Mutable uniform grid over brush AABBs for near-linear point and overlap
 * queries. Supports full rebuild and incremental upsert so live CSG edits do
 * not re-bin every brush each frame.
 */
export class BrushSpatialIndex {
  private entries: SpatialBoundsEntry[] = [];
  private cellSize = 1;
  private pad = 0;
  private readonly cells = new Map<bigint, number[]>();
  private readonly cellKeysByIndex = new Map<number, bigint[]>();

  /**
   * Creates a spatial index, optionally populated from bounds entries.
   *
   * @param entries Optional bounds entries aligned with prepared brush indices.
   * @param pad Extra margin applied to bounds when binning and querying.
   */
  constructor(entries: SpatialBoundsEntry[] = [], pad: number = 0) {
    if (entries.length > 0) {
      this.rebuild(entries, pad);
    } else {
      this.pad = pad;
    }
  }

  /**
   * Returns the number of bounds entries in the index.
   *
   * @returns Entry count.
   */
  getEntryCount(): number {
    return this.entries.length;
  }

  /**
   * Returns the pad used for binning and queries.
   *
   * @returns Pad distance.
   */
  getPad(): number {
    return this.pad;
  }

  /** Clears all cells and entries. */
  clear(): void {
    this.entries = [];
    this.cells.clear();
    this.cellKeysByIndex.clear();
    this.cellSize = 1;
  }

  /**
   * Fully rebuilds the grid from prepared-order bounds entries.
   *
   * @param entries Bounds entries aligned with prepared brush indices.
   * @param pad Extra margin applied to bounds when binning and querying.
   */
  rebuild(entries: SpatialBoundsEntry[], pad: number): void {
    this.clear();
    this.pad = pad;
    this.entries = entries.map((entry) => ({ bounds: entry.bounds }));
    this.cellSize = BrushSpatialIndex.chooseCellSize(this.entries);
    for (let index = 0; index < this.entries.length; index++) {
      this.insertEntry(index);
    }
  }

  /**
   * Replaces bounds for one prepared index and rebins only that entry. No-op
   * when the index is out of range.
   *
   * @param index Prepared brush index.
   * @param bounds New model-space bounds.
   */
  upsert(index: number, bounds: THREE.Box3): void {
    if (index < 0 || index >= this.entries.length) {
      return;
    }
    this.removeEntryFromCells(index);
    this.entries[index] = { bounds };
    this.insertEntry(index);
  }

  /**
   * Returns prepared indices whose padded bounds may contain the point.
   *
   * @param point Sample point in model space.
   * @returns Candidate indices (unsorted, unique).
   */
  queryPoint(point: THREE.Vector3): number[] {
    if (this.entries.length === 0) {
      return [];
    }
    if (this.entries.length <= 24) {
      return this.queryPointLinear(point);
    }
    return this.queryPointGrid(point);
  }

  /**
   * Returns indices that overlap a query bounds (excluding the optional self
   * index).
   *
   * @param bounds Query bounds.
   * @param excludeIndex Optional index to skip.
   * @returns Overlapping candidate indices.
   */
  queryBounds(bounds: THREE.Box3, excludeIndex: number = -1): number[] {
    if (this.entries.length === 0) {
      return [];
    }
    if (this.entries.length <= 24) {
      return this.queryBoundsLinear(bounds, excludeIndex);
    }
    return this.queryBoundsGrid(bounds, excludeIndex);
  }

  /**
   * Grid point query for larger scenes.
   *
   * @param point Sample point.
   * @returns Matching indices.
   */
  private queryPointGrid(point: THREE.Vector3): number[] {
    const cellX = Math.floor(point.x / this.cellSize);
    const cellY = Math.floor(point.y / this.cellSize);
    const cellZ = Math.floor(point.z / this.cellSize);
    const bucket = this.cells.get(packSpatialCellKey(cellX, cellY, cellZ));
    if (!bucket || bucket.length === 0) {
      return [];
    }
    const result: number[] = [];
    for (const index of bucket) {
      if (this.boundsContainPoint(this.entries[index]!.bounds, point)) {
        result.push(index);
      }
    }
    return result;
  }

  /**
   * Grid bounds query for larger scenes.
   *
   * @param bounds Query bounds.
   * @param excludeIndex Index to skip.
   * @returns Matching indices.
   */
  private queryBoundsGrid(bounds: THREE.Box3, excludeIndex: number): number[] {
    const candidates = this.collectCellCandidates(bounds, excludeIndex);
    const result: number[] = [];
    for (const index of candidates) {
      if (this.boundsOverlap(bounds, this.entries[index]!.bounds)) {
        result.push(index);
      }
    }
    return result;
  }

  /**
   * Collects unique indices from cells covered by padded query bounds.
   *
   * @param bounds Query bounds.
   * @param excludeIndex Index to skip.
   * @returns Candidate indices.
   */
  private collectCellCandidates(bounds: THREE.Box3, excludeIndex: number): number[] {
    const minX = Math.floor((bounds.min.x - this.pad) / this.cellSize);
    const minY = Math.floor((bounds.min.y - this.pad) / this.cellSize);
    const minZ = Math.floor((bounds.min.z - this.pad) / this.cellSize);
    const maxX = Math.floor((bounds.max.x + this.pad) / this.cellSize);
    const maxY = Math.floor((bounds.max.y + this.pad) / this.cellSize);
    const maxZ = Math.floor((bounds.max.z + this.pad) / this.cellSize);
    const seen = new Set<number>();
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          this.addBucketToSeen(packSpatialCellKey(x, y, z), excludeIndex, seen);
        }
      }
    }
    return Array.from(seen);
  }

  /**
   * Adds one cell bucket into a seen set.
   *
   * @param key Cell key.
   * @param excludeIndex Index to skip.
   * @param seen Accumulator set.
   */
  private addBucketToSeen(key: bigint, excludeIndex: number, seen: Set<number>): void {
    const bucket = this.cells.get(key);
    if (!bucket) {
      return;
    }
    for (const index of bucket) {
      if (index !== excludeIndex) {
        seen.add(index);
      }
    }
  }

  /**
   * Linear point query for tiny scenes.
   *
   * @param point Sample point.
   * @returns Matching indices.
   */
  private queryPointLinear(point: THREE.Vector3): number[] {
    const result: number[] = [];
    for (let index = 0; index < this.entries.length; index++) {
      if (this.boundsContainPoint(this.entries[index]!.bounds, point)) {
        result.push(index);
      }
    }
    return result;
  }

  /**
   * Linear bounds query for tiny scenes.
   *
   * @param bounds Query bounds.
   * @param excludeIndex Index to skip.
   * @returns Matching indices.
   */
  private queryBoundsLinear(bounds: THREE.Box3, excludeIndex: number): number[] {
    const result: number[] = [];
    for (let index = 0; index < this.entries.length; index++) {
      if (index === excludeIndex) {
        continue;
      }
      if (this.boundsOverlap(bounds, this.entries[index]!.bounds)) {
        result.push(index);
      }
    }
    return result;
  }

  /**
   * Inserts one entry into every overlapped grid cell.
   *
   * @param index Entry index.
   */
  private insertEntry(index: number): void {
    const bounds = this.entries[index]!.bounds;
    const keys = this.enumerateCellKeys(bounds);
    this.cellKeysByIndex.set(index, keys);
    for (const key of keys) {
      this.pushIndexIntoCell(key, index);
    }
  }

  /**
   * Removes one entry from every cell it currently occupies.
   *
   * @param index Entry index.
   */
  private removeEntryFromCells(index: number): void {
    const keys = this.cellKeysByIndex.get(index);
    if (!keys) {
      return;
    }
    for (const key of keys) {
      this.removeIndexFromCell(key, index);
    }
    this.cellKeysByIndex.delete(index);
  }

  /**
   * Enumerates cell keys covered by padded bounds.
   *
   * @param bounds Brush bounds.
   * @returns Cell keys.
   */
  private enumerateCellKeys(bounds: THREE.Box3): bigint[] {
    const minX = Math.floor((bounds.min.x - this.pad) / this.cellSize);
    const minY = Math.floor((bounds.min.y - this.pad) / this.cellSize);
    const minZ = Math.floor((bounds.min.z - this.pad) / this.cellSize);
    const maxX = Math.floor((bounds.max.x + this.pad) / this.cellSize);
    const maxY = Math.floor((bounds.max.y + this.pad) / this.cellSize);
    const maxZ = Math.floor((bounds.max.z + this.pad) / this.cellSize);
    const keys: bigint[] = [];
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          keys.push(packSpatialCellKey(x, y, z));
        }
      }
    }
    return keys;
  }

  /**
   * Pushes an index into a cell bucket.
   *
   * @param key Cell key.
   * @param index Entry index.
   */
  private pushIndexIntoCell(key: bigint, index: number): void {
    const bucket = this.cells.get(key);
    if (bucket) {
      bucket.push(index);
      return;
    }
    this.cells.set(key, [index]);
  }

  /**
   * Removes an index from a cell bucket.
   *
   * @param key Cell key.
   * @param index Entry index.
   */
  private removeIndexFromCell(key: bigint, index: number): void {
    const bucket = this.cells.get(key);
    if (!bucket) {
      return;
    }
    const position = bucket.indexOf(index);
    if (position < 0) {
      return;
    }
    bucket.splice(position, 1);
    if (bucket.length === 0) {
      this.cells.delete(key);
    }
  }

  /**
   * Returns whether padded bounds contain a point.
   *
   * @param bounds Brush bounds.
   * @param point Sample point.
   * @returns True when the point may lie inside the brush volume.
   */
  private boundsContainPoint(bounds: THREE.Box3, point: THREE.Vector3): boolean {
    const pad = this.pad;
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
   * Returns whether two bounds overlap with pad.
   *
   * @param a First bounds.
   * @param b Second bounds.
   * @returns True when they may touch or intersect.
   */
  private boundsOverlap(a: THREE.Box3, b: THREE.Box3): boolean {
    const pad = this.pad;
    return !(
      a.max.x + pad < b.min.x ||
      a.min.x - pad > b.max.x ||
      a.max.y + pad < b.min.y ||
      a.min.y - pad > b.max.y ||
      a.max.z + pad < b.min.z ||
      a.min.z - pad > b.max.z
    );
  }

  /**
   * Chooses a cell size from average brush extent.
   *
   * @param entries Bounds entries.
   * @returns Positive cell edge length.
   */
  private static chooseCellSize(entries: SpatialBoundsEntry[]): number {
    if (entries.length === 0) {
      return 1;
    }
    let totalExtent = 0;
    for (const entry of entries) {
      const bounds = entry.bounds;
      const extentX = bounds.max.x - bounds.min.x;
      const extentY = bounds.max.y - bounds.min.y;
      const extentZ = bounds.max.z - bounds.min.z;
      totalExtent += Math.max(extentX, extentY, extentZ, 1e-3);
    }
    return Math.max(totalExtent / entries.length, 1e-3);
  }
}
