import * as THREE from 'three';

/**
 * Bounds entry stored in the uniform spatial grid.
 */
export interface SpatialBoundsEntry {
  /** Axis-aligned bounds in model space. */
  bounds: THREE.Box3;
}

/**
 * Uniform grid over brush AABBs for near-linear point and overlap queries.
 * Used for CSG membership sampling and partial neighbor linking.
 */
export class BrushSpatialIndex {
  private readonly entries: SpatialBoundsEntry[];
  private readonly cellSize: number;
  private readonly pad: number;
  private readonly cells = new Map<string, number[]>();

  /**
   * Builds a spatial index over prepared brush bounds.
   * @param entries Bounds entries aligned with prepared brush indices.
   * @param pad Extra margin applied to bounds when binning and querying.
   */
  constructor(entries: SpatialBoundsEntry[], pad: number) {
    this.entries = entries;
    this.pad = pad;
    this.cellSize = BrushSpatialIndex.chooseCellSize(entries);
    for (let index = 0; index < entries.length; index++) {
      this.insertEntry(index);
    }
  }

  /**
   * Returns prepared indices whose padded bounds may contain the point.
   * @param point Sample point in model space.
   * @returns Candidate indices (unsorted, unique).
   */
  queryPoint(point: THREE.Vector3): number[] {
    if (this.entries.length === 0) return [];
    if (this.entries.length <= 24) {
      return this.queryPointLinear(point);
    }
    const cellX = Math.floor(point.x / this.cellSize);
    const cellY = Math.floor(point.y / this.cellSize);
    const cellZ = Math.floor(point.z / this.cellSize);
    const key = `${cellX},${cellY},${cellZ}`;
    const bucket = this.cells.get(key);
    if (!bucket || bucket.length === 0) return [];
    const result: number[] = [];
    for (const index of bucket) {
      if (this.boundsContainPoint(this.entries[index].bounds, point)) {
        result.push(index);
      }
    }
    return result;
  }

  /**
   * Returns indices that overlap a query bounds (excluding the optional self index).
   * @param bounds Query bounds.
   * @param excludeIndex Optional index to skip.
   * @returns Overlapping candidate indices.
   */
  queryBounds(bounds: THREE.Box3, excludeIndex: number = -1): number[] {
    if (this.entries.length === 0) return [];
    if (this.entries.length <= 24) {
      return this.queryBoundsLinear(bounds, excludeIndex);
    }
    const candidates = new Set<number>();
    const minX = Math.floor((bounds.min.x - this.pad) / this.cellSize);
    const minY = Math.floor((bounds.min.y - this.pad) / this.cellSize);
    const minZ = Math.floor((bounds.min.z - this.pad) / this.cellSize);
    const maxX = Math.floor((bounds.max.x + this.pad) / this.cellSize);
    const maxY = Math.floor((bounds.max.y + this.pad) / this.cellSize);
    const maxZ = Math.floor((bounds.max.z + this.pad) / this.cellSize);
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const bucket = this.cells.get(`${x},${y},${z}`);
          if (!bucket) continue;
          for (const index of bucket) {
            if (index === excludeIndex) continue;
            candidates.add(index);
          }
        }
      }
    }
    const result: number[] = [];
    for (const index of candidates) {
      if (this.boundsOverlap(bounds, this.entries[index].bounds)) {
        result.push(index);
      }
    }
    return result;
  }

  /**
   * Linear point query for tiny scenes.
   * @param point Sample point.
   * @returns Matching indices.
   */
  private queryPointLinear(point: THREE.Vector3): number[] {
    const result: number[] = [];
    for (let index = 0; index < this.entries.length; index++) {
      if (this.boundsContainPoint(this.entries[index].bounds, point)) {
        result.push(index);
      }
    }
    return result;
  }

  /**
   * Linear bounds query for tiny scenes.
   * @param bounds Query bounds.
   * @param excludeIndex Index to skip.
   * @returns Matching indices.
   */
  private queryBoundsLinear(bounds: THREE.Box3, excludeIndex: number): number[] {
    const result: number[] = [];
    for (let index = 0; index < this.entries.length; index++) {
      if (index === excludeIndex) continue;
      if (this.boundsOverlap(bounds, this.entries[index].bounds)) {
        result.push(index);
      }
    }
    return result;
  }

  /**
   * Inserts one entry into every overlapped grid cell.
   * @param index Entry index.
   */
  private insertEntry(index: number): void {
    const bounds = this.entries[index].bounds;
    const minX = Math.floor((bounds.min.x - this.pad) / this.cellSize);
    const minY = Math.floor((bounds.min.y - this.pad) / this.cellSize);
    const minZ = Math.floor((bounds.min.z - this.pad) / this.cellSize);
    const maxX = Math.floor((bounds.max.x + this.pad) / this.cellSize);
    const maxY = Math.floor((bounds.max.y + this.pad) / this.cellSize);
    const maxZ = Math.floor((bounds.max.z + this.pad) / this.cellSize);
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const key = `${x},${y},${z}`;
          const bucket = this.cells.get(key);
          if (bucket) bucket.push(index);
          else this.cells.set(key, [index]);
        }
      }
    }
  }

  /**
   * Returns whether padded bounds contain a point.
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
   * @param entries Bounds entries.
   * @returns Positive cell edge length.
   */
  private static chooseCellSize(entries: SpatialBoundsEntry[]): number {
    if (entries.length === 0) return 1;
    let totalExtent = 0;
    for (const entry of entries) {
      const size = entry.bounds.getSize(new THREE.Vector3());
      totalExtent += Math.max(size.x, size.y, size.z, 1e-3);
    }
    return Math.max(totalExtent / entries.length, 1e-3);
  }
}
