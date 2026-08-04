import * as THREE from 'three';
import type { SolidPlane } from '@/solid/brush/solid_plane.js';
import { HashedVertexTable } from '@/solid/algorithm/spatial/hashed_vertex_table.js';
import { SolidAlgorithmCreateIntersectionLoopsOutside } from './solid_algorithm_create_intersection_loops_outside.js';
import {
  solidAlgorithmPlaneVertexIndexPairPushUnique,
  type SolidAlgorithmPlaneVertexIndexPair,
} from './solid_algorithm_plane_vertex_index_pair.js';

/**
 * Finds vertices of one brush that lie inside the other and maps them onto face
 * loops.
 */
export class SolidAlgorithmCreateIntersectionLoopsFindInside {
  /**
   * Appends inside vertices into foundIndices for their incident planes.
   *
   * @param usedVertices Vertices of brush0 that participate.
   * @param vertexIntersectionPlanes Flat plane indices per used vertex.
   * @param vertexIntersectionSegments Per-vertex segments into the flat list.
   * @param intersectingPlanes1 Planes of the other brush.
   * @param intersectingPlanesAndEdges1Length Plane count for outside test.
   * @param hashedTreeSpaceVertices Output vertex welder.
   * @param snapHashedVertices Snap welder (brush verts preloaded).
   * @param foundIndices0 Accumulator of plane/vertex pairs.
   */
  static find(
    usedVertices: readonly THREE.Vector3[],
    vertexIntersectionPlanes: readonly number[],
    vertexIntersectionSegments: ReadonlyArray<{ offset: number; length: number }>,
    intersectingPlanes1: readonly SolidPlane[],
    intersectingPlanesAndEdges1Length: number,
    hashedTreeSpaceVertices: HashedVertexTable,
    snapHashedVertices: HashedVertexTable,
    foundIndices0: SolidAlgorithmPlaneVertexIndexPair[],
  ): void {
    const kept = this.keepInsideVertices(usedVertices, intersectingPlanes1, intersectingPlanesAndEdges1Length);
    for (const entry of kept) {
      this.appendVertexToFoundIndices(
        entry.vertex,
        entry.usedVertexIndex,
        vertexIntersectionPlanes,
        vertexIntersectionSegments,
        hashedTreeSpaceVertices,
        snapHashedVertices,
        foundIndices0,
      );
    }
  }

  /**
   * Filters used vertices that are not outside the other brush planes.
   *
   * @param usedVertices Candidate vertices.
   * @param intersectingPlanes1 Other brush planes.
   * @param planesLength Plane count for the outside test.
   * @returns Kept vertices with original used-vertex indices.
   */
  private static keepInsideVertices(
    usedVertices: readonly THREE.Vector3[],
    intersectingPlanes1: readonly SolidPlane[],
    planesLength: number,
  ): Array<{ vertex: THREE.Vector3; usedVertexIndex: number }> {
    const kept: Array<{ vertex: THREE.Vector3; usedVertexIndex: number }> = [];
    for (let index = 0; index < usedVertices.length; index++) {
      const vertex = usedVertices[index]!;
      if (SolidAlgorithmCreateIntersectionLoopsOutside.isOutsidePlanes(intersectingPlanes1, planesLength, vertex)) {
        continue;
      }
      kept.push({ vertex, usedVertexIndex: index });
    }
    return kept;
  }

  /**
   * Snaps one inside vertex and records it for each incident plane.
   *
   * @param vertex Local / model-space vertex.
   * @param usedVertexIndex Index into usedVertices.
   * @param vertexIntersectionPlanes Flat plane indices.
   * @param vertexIntersectionSegments Segments.
   * @param hashedTreeSpaceVertices Output welder.
   * @param snapHashedVertices Snap welder.
   * @param foundIndices0 Accumulator.
   */
  private static appendVertexToFoundIndices(
    vertex: THREE.Vector3,
    usedVertexIndex: number,
    vertexIntersectionPlanes: readonly number[],
    vertexIntersectionSegments: ReadonlyArray<{ offset: number; length: number }>,
    hashedTreeSpaceVertices: HashedVertexTable,
    snapHashedVertices: HashedVertexTable,
    foundIndices0: SolidAlgorithmPlaneVertexIndexPair[],
  ): void {
    const segment = vertexIntersectionSegments[usedVertexIndex];
    if (!segment || segment.length === 0) {
      return;
    }
    const snapped = snapHashedVertices.snap(vertex);
    const treeSpaceVertexIndex = hashedTreeSpaceVertices.add(snapped);
    for (let planeSlot = segment.offset; planeSlot < segment.offset + segment.length; planeSlot++) {
      const planeIndex = vertexIntersectionPlanes[planeSlot];
      if (planeIndex === undefined) {
        continue;
      }
      solidAlgorithmPlaneVertexIndexPairPushUnique(foundIndices0, planeIndex, treeSpaceVertexIndex);
    }
  }
}
