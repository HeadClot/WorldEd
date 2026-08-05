/** Number of float components stored per face-corner UV (u, v). */
export const MESH_FACE_CORNER_UV_STRIDE = 2;

/** Per-half-edge (face-corner) UV storage packed as interleaved u,v floats. */
export class MeshFaceCornerUvStore {
  private values: Float32Array;

  /**
   * Creates a UV store sized for a half-edge count.
   *
   * @param halfEdgeCount Number of half-edges / corners.
   */
  constructor(halfEdgeCount: number = 0) {
    this.values = new Float32Array(Math.max(0, halfEdgeCount) * MESH_FACE_CORNER_UV_STRIDE);
  }

  /**
   * Returns the packed UV buffer.
   *
   * @returns Interleaved u,v floats.
   */
  getValues(): Float32Array {
    return this.values;
  }

  /**
   * Replaces the packed UV buffer.
   *
   * @param values Interleaved u,v floats.
   */
  setValues(values: Float32Array): void {
    this.values = values;
  }

  /**
   * Returns the number of corners implied by the buffer length.
   *
   * @returns Corner count.
   */
  getCornerCount(): number {
    return Math.floor(this.values.length / MESH_FACE_CORNER_UV_STRIDE);
  }

  /**
   * Ensures capacity for at least the given half-edge count.
   *
   * @param halfEdgeCount Required corner count.
   */
  ensureCornerCount(halfEdgeCount: number): void {
    const required = halfEdgeCount * MESH_FACE_CORNER_UV_STRIDE;
    if (this.values.length >= required) {
      return;
    }
    const next = new Float32Array(required);
    next.set(this.values);
    this.values = next;
  }

  /**
   * Writes a corner UV.
   *
   * @param halfEdgeIndex Corner / half-edge index.
   * @param u Texture U.
   * @param v Texture V.
   */
  write(halfEdgeIndex: number, u: number, v: number): void {
    const base = halfEdgeIndex * MESH_FACE_CORNER_UV_STRIDE;
    this.values[base] = u;
    this.values[base + 1] = v;
  }

  /**
   * Reads a corner UV into an output pair.
   *
   * @param halfEdgeIndex Corner / half-edge index.
   * @param outUv Length-2 receiver for u,v.
   */
  read(halfEdgeIndex: number, outUv: { 0: number; 1: number; length: number }): void {
    const base = halfEdgeIndex * MESH_FACE_CORNER_UV_STRIDE;
    outUv[0] = this.values[base]!;
    outUv[1] = this.values[base + 1]!;
  }

  /**
   * Deep-clones this UV store.
   *
   * @returns Independent copy.
   */
  clone(): MeshFaceCornerUvStore {
    const copy = new MeshFaceCornerUvStore();
    copy.setValues(new Float32Array(this.values));
    return copy;
  }
}
