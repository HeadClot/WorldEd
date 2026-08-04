import * as THREE from 'three';
import {
  SOLID_SQR_VERTEX_EQUAL_EPSILON,
  SOLID_VERTEX_HASH_CELL_SIZE,
} from '@/solid/algorithm/math/solid_math_constants.js';

/**
 * Welds nearly-identical vertices for solid CSG intermediate geometry using a
 * spatial hash.
 */
export class HashedVertexTable {
  private readonly vertices: THREE.Vector3[] = [];
  private readonly cellMap = new Map<string, number[]>();
  private readonly cellSize: number;
  private readonly sqrEqualEpsilon: number;

  /**
   * Creates a hashed vertex table.
   *
   * @param cellSize Spatial hash cell size (defaults to kCellSize).
   * @param sqrEqualEpsilon Squared distance threshold for welding.
   */
  constructor(
    cellSize: number = SOLID_VERTEX_HASH_CELL_SIZE,
    sqrEqualEpsilon: number = SOLID_SQR_VERTEX_EQUAL_EPSILON,
  ) {
    this.cellSize = cellSize;
    this.sqrEqualEpsilon = sqrEqualEpsilon;
  }

  /**
   * Inserts a point, returning the stable welded index of the closest match.
   *
   * @param point Point to insert.
   * @returns Index of the existing or newly created vertex.
   */
  add(point: THREE.Vector3): number {
    const closestIndex = this.findClosestIndex(point);
    if (closestIndex >= 0) {
      return closestIndex;
    }
    return this.insertNewVertex(point);
  }

  /**
   * Returns a clone of the welded position for a point (add + get).
   *
   * @param point Point to snap.
   * @returns Canonical welded position clone.
   */
  snap(point: THREE.Vector3): THREE.Vector3 {
    return this.get(this.add(point)).clone();
  }

  /** Clears all stored vertices and hash buckets. */
  clear(): void {
    this.vertices.length = 0;
    this.cellMap.clear();
  }

  /**
   * Returns the welded vertex list as clones.
   *
   * @returns Vertices in insertion order.
   */
  getVertices(): THREE.Vector3[] {
    return this.vertices.map((vertex) => vertex.clone());
  }

  /**
   * Returns the number of unique vertices.
   *
   * @returns Vertex count.
   */
  get count(): number {
    return this.vertices.length;
  }

  /**
   * Returns a vertex by index (shared table storage; do not mutate).
   *
   * @param index Vertex index.
   * @returns Vertex position.
   */
  get(index: number): THREE.Vector3 {
    return this.vertices[index]!;
  }

  /**
   * Finds the closest existing vertex within the equal-epsilon ball.
   *
   * @param point Query point.
   * @returns Closest index, or -1 when none match.
   */
  private findClosestIndex(point: THREE.Vector3): number {
    const candidates = this.gatherNearbyIndices(this.cellKeyForPoint(point));
    let closestIndex = -1;
    let closestDistance = this.sqrEqualEpsilon;
    for (const index of candidates) {
      const distance = this.vertices[index]!.distanceToSquared(point);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    }
    return closestIndex;
  }

  /**
   * Appends a new unique vertex into the table and spatial hash.
   *
   * @param point Point to store.
   * @returns New vertex index.
   */
  private insertNewVertex(point: THREE.Vector3): number {
    const newIndex = this.vertices.length;
    this.vertices.push(point.clone());
    this.storeIndexInCell(this.cellKeyForPoint(point), newIndex);
    return newIndex;
  }

  /**
   * Builds a spatial hash key for a point. Cell indices use toward-zero
   * truncation so negative coordinates match `(int)(coord / kCellSize)`.
   *
   * @param point Point to hash.
   * @returns Cell key string.
   */
  private cellKeyForPoint(point: THREE.Vector3): string {
    const cellX = Math.trunc(point.x / this.cellSize);
    const cellY = Math.trunc(point.y / this.cellSize);
    const cellZ = Math.trunc(point.z / this.cellSize);
    return `${cellX},${cellY},${cellZ}`;
  }

  /**
   * Collects candidate vertex indices from a cell and its neighbors.
   *
   * @param cellKey Center cell key.
   * @returns Candidate indices.
   */
  private gatherNearbyIndices(cellKey: string): number[] {
    const parts = cellKey.split(',').map(Number);
    const cx = parts[0]!;
    const cy = parts[1]!;
    const cz = parts[2]!;
    const result: number[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          this.appendCellBucket(result, `${cx + dx},${cy + dy},${cz + dz}`);
        }
      }
    }
    return result;
  }

  /**
   * Appends one spatial-cell bucket into a candidate list.
   *
   * @param result Candidate index list.
   * @param key Cell key.
   */
  private appendCellBucket(result: number[], key: string): void {
    const bucket = this.cellMap.get(key);
    if (bucket) {
      result.push(...bucket);
    }
  }

  /**
   * Stores an index in a spatial cell bucket.
   *
   * @param cellKey Cell key.
   * @param index Vertex index.
   */
  private storeIndexInCell(cellKey: string, index: number): void {
    const bucket = this.cellMap.get(cellKey);
    if (bucket) {
      bucket.push(index);
      return;
    }
    this.cellMap.set(cellKey, [index]);
  }
}
