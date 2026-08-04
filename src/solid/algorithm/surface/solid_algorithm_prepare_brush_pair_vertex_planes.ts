import type * as THREE from 'three';
import type { SolidPlane } from '@/solid/brush/solid_plane.js';
import { SOLID_PLANE_D_ALIGN_EPSILON } from '@/solid/algorithm/math/solid_math_constants.js';

/** Maps used vertices to face planes they lie on. */
export class SolidAlgorithmPrepareBrushPairVertexPlanes {
  /**
   * Builds flat plane-index list and per-vertex segments for used vertices.
   *
   * @param usedVertices Vertices that participate in the pair.
   * @param intersectingPlaneIndices Intersecting face plane indices.
   * @param localPlanes All face planes of the same brush.
   * @returns Flat plane indices and (offset, length) segments.
   */
  static find(
    usedVertices: readonly THREE.Vector3[],
    intersectingPlaneIndices: readonly number[],
    localPlanes: readonly SolidPlane[],
  ): {
    vertexIntersectionPlanes: number[];
    vertexIntersectionSegments: Array<{ offset: number; length: number }>;
  } {
    const vertexIntersectionPlanes: number[] = [];
    const vertexIntersectionSegments: Array<{ offset: number; length: number }> = [];
    for (const vertex of usedVertices) {
      const offset = vertexIntersectionPlanes.length;
      this.appendPlanesForVertex(vertex, intersectingPlaneIndices, localPlanes, vertexIntersectionPlanes);
      vertexIntersectionSegments.push({
        offset,
        length: vertexIntersectionPlanes.length - offset,
      });
    }
    if (vertexIntersectionPlanes.length <= 0) {
      vertexIntersectionPlanes.push(0);
    }
    return { vertexIntersectionPlanes, vertexIntersectionSegments };
  }

  /**
   * Appends intersecting plane indices that the vertex lies on.
   *
   * @param vertex Used vertex.
   * @param intersectingPlaneIndices Candidate plane indices.
   * @param localPlanes All face planes.
   * @param vertexIntersectionPlanes Accumulator.
   */
  private static appendPlanesForVertex(
    vertex: THREE.Vector3,
    intersectingPlaneIndices: readonly number[],
    localPlanes: readonly SolidPlane[],
    vertexIntersectionPlanes: number[],
  ): void {
    for (const planeIndex of intersectingPlaneIndices) {
      const plane = localPlanes[planeIndex];
      if (!plane) {
        continue;
      }
      const distance = plane.signedDistance(vertex);
      if (distance >= -SOLID_PLANE_D_ALIGN_EPSILON && distance <= SOLID_PLANE_D_ALIGN_EPSILON) {
        vertexIntersectionPlanes.push(planeIndex);
      }
    }
  }
}
