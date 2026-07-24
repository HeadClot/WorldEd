import { SolidBrushMeshChunk } from './solid_brush_mesh_chunk.js';

/**
 * Caches per-brush triangulated mesh chunks so partial CSG updates only remesh
 * brushes that actually recompiled.
 */
export class SolidMeshChunkCache {
  private readonly chunksByBrushId = new Map<string, SolidBrushMeshChunk>();

  /** Clears every cached mesh chunk. */
  clear(): void {
    this.chunksByBrushId.clear();
  }

  /**
   * Returns a cached chunk for a brush.
   *
   * @param brushId Brush instance id.
   * @returns Chunk or undefined.
   */
  get(brushId: string): SolidBrushMeshChunk | undefined {
    return this.chunksByBrushId.get(brushId);
  }

  /**
   * Stores a mesh chunk for a brush.
   *
   * @param brushId Brush instance id.
   * @param chunk Triangulated chunk.
   */
  set(brushId: string, chunk: SolidBrushMeshChunk): void {
    this.chunksByBrushId.set(brushId, chunk);
  }

  /**
   * Removes one brush chunk.
   *
   * @param brushId Brush instance id.
   */
  remove(brushId: string): void {
    this.chunksByBrushId.delete(brushId);
  }

  /**
   * Drops chunks for brushes no longer present.
   *
   * @param activeIds Active brush ids.
   */
  pruneToIds(activeIds: Set<string>): void {
    for (const brushId of this.chunksByBrushId.keys()) {
      if (!activeIds.has(brushId)) {
        this.chunksByBrushId.delete(brushId);
      }
    }
  }

  /**
   * Returns whether every listed brush has a mesh chunk.
   *
   * @param brushIds Brush ids in tree order.
   * @returns True when all chunks exist.
   */
  hasAll(brushIds: readonly string[]): boolean {
    for (const brushId of brushIds) {
      if (!this.chunksByBrushId.has(brushId)) return false;
    }
    return true;
  }
}
