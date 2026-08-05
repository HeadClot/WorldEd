import * as THREE from 'three';
import { packSpatialCellKey } from './spatial_cell_key.js';

/** Bounds entry stored in the uniform spatial grid. */
export interface SpatialBoundsEntry {
  /** Axis-aligned bounds in model space. */
  bounds: THREE.Box3;
}

/**
 * Maximum grid cells one brush may occupy. Larger AABBs skip the grid and are
 * tracked as oversized so a single scale drag cannot exhaust Map capacity.
 */
const MAX_CELLS_PER_ENTRY = 4096;

/**
 * Maximum grid cells a bounds query may visit before falling back to a linear
 * scan of all entries.
 */
const MAX_CELLS_PER_QUERY = 8192;

/**
 * Rebuilds the whole grid when an upsert would span this many cells along any
 * axis relative to the current cell size, so average cell size can catch up.
 */
const REBUILD_SPAN_AXIS_THRESHOLD = 48;

/**
 * Mutable uniform grid over brush AABBs for near-linear point and overlap
 * queries. Supports full rebuild and incremental upsert so live CSG edits do
 * not re-bin every brush each frame. Brushes that would flood the grid are kept
 * in an oversized set and always tested by exact bounds.
 */
export class BrushSpatialIndex {
  private entries: SpatialBoundsEntry[] = [];
  private cellSize = 1;
  private pad = 0;
  private readonly cells = new Map<bigint, number[]>();
  private readonly cellKeysByIndex = new Map<number, bigint[]>();
  private readonly oversizedIndices = new Set<number>();

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

  /**
   * Returns the active grid cell edge length.
   *
   * @returns Positive cell size.
   */
  getCellSize(): number {
    return this.cellSize;
  }

  /**
   * Returns how many entries are tracked outside the uniform grid.
   *
   * @returns Oversized entry count.
   */
  getOversizedEntryCount(): number {
    return this.oversizedIndices.size;
  }

  /** Clears all cells and entries. */
  clear(): void {
    this.entries = [];
    this.cells.clear();
    this.cellKeysByIndex.clear();
    this.oversizedIndices.clear();
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
   * Replaces bounds for one prepared index and rebins only that entry. Rebuilds
   * the full grid when the new bounds would span far more cells than the
   * current cell size allows. No-op when the index is out of range.
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
    if (this.shouldRebuildAfterBoundsChange(bounds)) {
      this.rebuild(this.entries, this.pad);
      return;
    }
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
   * Grid point query for larger scenes, always including oversized entries.
   *
   * @param point Sample point.
   * @returns Matching indices.
   */
  private queryPointGrid(point: THREE.Vector3): number[] {
    const result: number[] = [];
    const seen = new Set<number>();
    this.appendOversizedPointHits(point, result, seen);
    this.appendGridCellPointHits(point, result, seen);
    return result;
  }

  /**
   * Adds oversized entries that contain the point.
   *
   * @param point Sample point.
   * @param result Output indices.
   * @param seen Dedup set.
   */
  private appendOversizedPointHits(point: THREE.Vector3, result: number[], seen: Set<number>): void {
    for (const index of this.oversizedIndices) {
      if (this.boundsContainPoint(this.entries[index]!.bounds, point)) {
        seen.add(index);
        result.push(index);
      }
    }
  }

  /**
   * Adds grid-bucket entries that contain the point.
   *
   * @param point Sample point.
   * @param result Output indices.
   * @param seen Dedup set.
   */
  private appendGridCellPointHits(point: THREE.Vector3, result: number[], seen: Set<number>): void {
    const cellX = Math.floor(point.x / this.cellSize);
    const cellY = Math.floor(point.y / this.cellSize);
    const cellZ = Math.floor(point.z / this.cellSize);
    const bucket = this.cells.get(packSpatialCellKey(cellX, cellY, cellZ));
    if (!bucket || bucket.length === 0) {
      return;
    }
    for (const index of bucket) {
      if (seen.has(index)) {
        continue;
      }
      if (this.boundsContainPoint(this.entries[index]!.bounds, point)) {
        seen.add(index);
        result.push(index);
      }
    }
  }

  /**
   * Grid bounds query for larger scenes, with linear fallback for huge spans.
   *
   * @param bounds Query bounds.
   * @param excludeIndex Index to skip.
   * @returns Matching indices.
   */
  private queryBoundsGrid(bounds: THREE.Box3, excludeIndex: number): number[] {
    if (this.cellSpanExceedsLimit(bounds, MAX_CELLS_PER_QUERY)) {
      return this.queryBoundsLinear(bounds, excludeIndex);
    }
    const candidates = this.collectCellCandidates(bounds, excludeIndex);
    this.appendOversizedCandidates(excludeIndex, candidates);
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
    const range = this.computePaddedCellRange(bounds);
    const seen = new Set<number>();
    for (let x = range.minX; x <= range.maxX; x++) {
      for (let y = range.minY; y <= range.maxY; y++) {
        for (let z = range.minZ; z <= range.maxZ; z++) {
          this.addBucketToSeen(packSpatialCellKey(x, y, z), excludeIndex, seen);
        }
      }
    }
    return Array.from(seen);
  }

  /**
   * Adds oversized entry indices into a candidate list without duplicates.
   *
   * @param excludeIndex Index to skip.
   * @param candidates Mutable candidate list.
   */
  private appendOversizedCandidates(excludeIndex: number, candidates: number[]): void {
    const seen = new Set(candidates);
    for (const index of this.oversizedIndices) {
      if (index === excludeIndex || seen.has(index)) {
        continue;
      }
      seen.add(index);
      candidates.push(index);
    }
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
   * Linear bounds query for tiny scenes or oversized query spans.
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
   * Inserts one entry into the grid or the oversized set.
   *
   * @param index Entry index.
   */
  private insertEntry(index: number): void {
    const bounds = this.entries[index]!.bounds;
    if (this.cellSpanExceedsLimit(bounds, MAX_CELLS_PER_ENTRY)) {
      this.oversizedIndices.add(index);
      this.cellKeysByIndex.set(index, []);
      return;
    }
    const keys = this.enumerateCellKeys(bounds);
    this.cellKeysByIndex.set(index, keys);
    for (const key of keys) {
      this.pushIndexIntoCell(key, index);
    }
  }

  /**
   * Removes one entry from every cell it currently occupies and the oversized
   * set.
   *
   * @param index Entry index.
   */
  private removeEntryFromCells(index: number): void {
    this.oversizedIndices.delete(index);
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
    const range = this.computePaddedCellRange(bounds);
    const keys: bigint[] = [];
    for (let x = range.minX; x <= range.maxX; x++) {
      for (let y = range.minY; y <= range.maxY; y++) {
        for (let z = range.minZ; z <= range.maxZ; z++) {
          keys.push(packSpatialCellKey(x, y, z));
        }
      }
    }
    return keys;
  }

  /**
   * Computes inclusive cell index ranges for padded bounds.
   *
   * @param bounds Source bounds.
   * @returns Inclusive min/max cell indices per axis.
   */
  private computePaddedCellRange(bounds: THREE.Box3): {
    minX: number;
    minY: number;
    minZ: number;
    maxX: number;
    maxY: number;
    maxZ: number;
  } {
    return {
      minX: Math.floor((bounds.min.x - this.pad) / this.cellSize),
      minY: Math.floor((bounds.min.y - this.pad) / this.cellSize),
      minZ: Math.floor((bounds.min.z - this.pad) / this.cellSize),
      maxX: Math.floor((bounds.max.x + this.pad) / this.cellSize),
      maxY: Math.floor((bounds.max.y + this.pad) / this.cellSize),
      maxZ: Math.floor((bounds.max.z + this.pad) / this.cellSize),
    };
  }

  /**
   * Returns whether padded bounds would cover more than maxCells grid cells.
   *
   * @param bounds Brush or query bounds.
   * @param maxCells Inclusive maximum cell count.
   * @returns True when the span is too large for safe grid traversal.
   */
  private cellSpanExceedsLimit(bounds: THREE.Box3, maxCells: number): boolean {
    const range = this.computePaddedCellRange(bounds);
    const countX = range.maxX - range.minX + 1;
    const countY = range.maxY - range.minY + 1;
    const countZ = range.maxZ - range.minZ + 1;
    if (countX <= 0 || countY <= 0 || countZ <= 0) {
      return false;
    }
    if (countX > maxCells || countY > maxCells || countZ > maxCells) {
      return true;
    }
    return countX * countY * countZ > maxCells;
  }

  /**
   * Returns whether an upsert should rebuild the full grid so cell size can
   * grow with a scaled brush.
   *
   * @param bounds New bounds for the upserted entry.
   * @returns True when a full rebuild is cheaper and safer than fine binning.
   */
  private shouldRebuildAfterBoundsChange(bounds: THREE.Box3): boolean {
    const extent = BrushSpatialIndex.boundsMaxExtent(bounds);
    if (extent <= this.cellSize * REBUILD_SPAN_AXIS_THRESHOLD) {
      return false;
    }
    const rebuiltCellSize = BrushSpatialIndex.chooseCellSize(this.entries);
    return rebuiltCellSize > this.cellSize * 1.5;
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
      totalExtent += BrushSpatialIndex.boundsMaxExtent(entry.bounds);
    }
    return Math.max(totalExtent / entries.length, 1e-3);
  }

  /**
   * Returns the largest axis extent of bounds, floored by a tiny epsilon.
   *
   * @param bounds Source bounds.
   * @returns Positive max extent.
   */
  private static boundsMaxExtent(bounds: THREE.Box3): number {
    const extentX = bounds.max.x - bounds.min.x;
    const extentY = bounds.max.y - bounds.min.y;
    const extentZ = bounds.max.z - bounds.min.z;
    return Math.max(extentX, extentY, extentZ, 1e-3);
  }
}
