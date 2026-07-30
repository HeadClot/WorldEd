import { SolidBrush } from '@/solid/brush/solid_brush.js';

/**
 * Builds a compact fingerprint of brush topology and local vertex positions so
 * shape edits invalidate prepared geometry without comparing full clones.
 */
export class BrushShapeFingerprint {
  /**
   * Computes a shape fingerprint for a local-space brush.
   *
   * @param brush Local brush geometry.
   * @returns Stable string fingerprint for equality checks.
   */
  static fromBrush(brush: SolidBrush): string {
    const vertexCount = brush.vertices.length;
    const faceCount = brush.faces.length;
    const edgeCount = brush.wingEdges.length;
    if (vertexCount === 0) {
      return `${vertexCount}:${faceCount}:${edgeCount}`;
    }
    const first = brush.vertices[0]!;
    const last = brush.vertices[vertexCount - 1]!;
    const mid = brush.vertices[Math.floor(vertexCount / 2)]!;
    return [
      vertexCount,
      faceCount,
      edgeCount,
      this.formatVertex(first),
      this.formatVertex(mid),
      this.formatVertex(last),
    ].join(':');
  }

  /**
   * Formats a vertex for inclusion in a fingerprint.
   *
   * @param vertex Vertex position.
   * @returns Compact coordinate string.
   */
  private static formatVertex(vertex: { x: number; y: number; z: number }): string {
    return `${vertex.x.toFixed(5)},${vertex.y.toFixed(5)},${vertex.z.toFixed(5)}`;
  }
}
