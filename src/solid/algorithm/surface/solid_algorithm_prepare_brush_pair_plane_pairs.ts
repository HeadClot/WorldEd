import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { SolidPlane } from '@/solid/brush/solid_plane.js';
import { SolidAlgorithmIntersectionType } from '@/solid/algorithm/routing/solid_algorithm_intersection_type.js';
import type { SolidAlgorithmPlanePair } from './solid_algorithm_plane_pair.js';

/** Builds used plane pairs and used vertices from brush wing edges. */
export class SolidAlgorithmPrepareBrushPairPlanePairs {
  /**
   * Collects plane pairs for intersecting face planes of a brush.
   *
   * @param type Pair intersection type.
   * @param brush Brush topology and geometry (model space).
   * @param intersectingPlaneIndices Face plane indices that participate.
   * @param localSpacePlanes All face planes of the brush (model space).
   * @returns Used plane pairs and used vertices.
   */
  static find(
    type: SolidAlgorithmIntersectionType,
    brush: SolidBrush,
    intersectingPlaneIndices: readonly number[],
    localSpacePlanes: readonly SolidPlane[],
  ): { usedPlanePairs: SolidAlgorithmPlanePair[]; usedVertices: THREE.Vector3[] } {
    if (type !== SolidAlgorithmIntersectionType.Intersection) {
      return this.allVerticesNoPairs(brush);
    }
    return this.findIntersectionPairs(brush, intersectingPlaneIndices, localSpacePlanes);
  }

  /**
   * Returns every brush vertex and no plane pairs (non-Intersection types).
   *
   * @param brush Source brush.
   * @returns Empty pairs and all vertices.
   */
  private static allVerticesNoPairs(brush: SolidBrush): {
    usedPlanePairs: SolidAlgorithmPlanePair[];
    usedVertices: THREE.Vector3[];
  } {
    return {
      usedPlanePairs: [],
      usedVertices: brush.vertices.map((vertex) => vertex.clone()),
    };
  }

  /**
   * Finds plane pairs for Intersection type.
   *
   * @param brush Source brush.
   * @param intersectingPlaneIndices Participating face indices.
   * @param localSpacePlanes Face planes.
   * @returns Used pairs and vertices.
   */
  private static findIntersectionPairs(
    brush: SolidBrush,
    intersectingPlaneIndices: readonly number[],
    localSpacePlanes: readonly SolidPlane[],
  ): { usedPlanePairs: SolidAlgorithmPlanePair[]; usedVertices: THREE.Vector3[] } {
    const planeAvailable = this.buildPlaneAvailableSet(intersectingPlaneIndices);
    const vertexUsed = new Array<number>(brush.vertices.length).fill(0);
    const usedPlanePairs: SolidAlgorithmPlanePair[] = [];
    this.collectPairsFromWingEdges(brush, localSpacePlanes, planeAvailable, vertexUsed, usedPlanePairs);
    const usedVertices = this.collectUsedVertices(brush, vertexUsed);
    return { usedPlanePairs, usedVertices };
  }

  /**
   * Builds a set of available face plane indices.
   *
   * @param intersectingPlaneIndices Indices to enable.
   * @returns Set of plane indices.
   */
  private static buildPlaneAvailableSet(intersectingPlaneIndices: readonly number[]): Set<number> {
    return new Set(intersectingPlaneIndices);
  }

  /**
   * Walks wing edges once each (twinIndex > e) and records available pairs.
   *
   * @param brush Source brush.
   * @param localSpacePlanes Face planes.
   * @param planeAvailable Available plane indices.
   * @param vertexUsed Vertex usage markers (1-based index or 0).
   * @param usedPlanePairs Accumulator for pairs.
   */
  private static collectPairsFromWingEdges(
    brush: SolidBrush,
    localSpacePlanes: readonly SolidPlane[],
    planeAvailable: ReadonlySet<number>,
    vertexUsed: number[],
    usedPlanePairs: SolidAlgorithmPlanePair[],
  ): void {
    for (let edgeIndex = 0; edgeIndex < brush.wingEdges.length; edgeIndex++) {
      this.tryAddPairForEdge(brush, edgeIndex, localSpacePlanes, planeAvailable, vertexUsed, usedPlanePairs);
    }
  }

  /**
   * Attempts to add one plane pair for a wing edge if both faces are available.
   *
   * @param brush Source brush.
   * @param edgeIndex Wing edge index.
   * @param localSpacePlanes Face planes.
   * @param planeAvailable Available planes.
   * @param vertexUsed Vertex usage markers.
   * @param usedPlanePairs Accumulator.
   */
  private static tryAddPairForEdge(
    brush: SolidBrush,
    edgeIndex: number,
    localSpacePlanes: readonly SolidPlane[],
    planeAvailable: ReadonlySet<number>,
    vertexUsed: number[],
    usedPlanePairs: SolidAlgorithmPlanePair[],
  ): void {
    const wingEdge = brush.wingEdges[edgeIndex];
    if (!wingEdge || wingEdge.twinIndex < edgeIndex) {
      return;
    }
    const planeIndex0 = brush.edgeFaceIndices[edgeIndex] ?? -1;
    const planeIndex1 = brush.edgeFaceIndices[wingEdge.twinIndex] ?? -1;
    if (!planeAvailable.has(planeIndex0) || !planeAvailable.has(planeIndex1)) {
      return;
    }
    const plane0 = localSpacePlanes[planeIndex0];
    const plane1 = localSpacePlanes[planeIndex1];
    if (!plane0 || !plane1) {
      return;
    }
    const twin = brush.wingEdges[wingEdge.twinIndex];
    if (!twin) {
      return;
    }
    const vertexIndex0 = wingEdge.vertexIndex;
    const vertexIndex1 = twin.vertexIndex;
    this.markVertexUsed(vertexUsed, vertexIndex0);
    this.markVertexUsed(vertexUsed, vertexIndex1);
    const vertex0 = brush.vertices[vertexIndex0];
    const vertex1 = brush.vertices[vertexIndex1];
    if (!vertex0 || !vertex1) {
      return;
    }
    usedPlanePairs.push({
      plane0,
      plane1,
      edgeVertex0: vertex0.clone(),
      edgeVertex1: vertex1.clone(),
      planeIndex0,
      planeIndex1,
    });
  }

  /**
   * Marks a vertex as used.
   *
   * @param vertexUsed Usage array.
   * @param vertexIndex Vertex index.
   */
  private static markVertexUsed(vertexUsed: number[], vertexIndex: number): void {
    if (vertexUsed[vertexIndex] === 0) {
      vertexUsed[vertexIndex] = vertexIndex + 1;
    }
  }

  /**
   * Collects used vertex positions from the usage markers.
   *
   * @param brush Source brush.
   * @param vertexUsed Usage markers.
   * @returns Used vertices in brush order among used slots.
   */
  private static collectUsedVertices(brush: SolidBrush, vertexUsed: readonly number[]): THREE.Vector3[] {
    const usedCount = vertexUsed.reduce((count, marker) => count + (marker !== 0 ? 1 : 0), 0);
    if (usedCount === 0) {
      return [];
    }
    if (usedCount === brush.vertices.length) {
      return brush.vertices.map((vertex) => vertex.clone());
    }
    const usedVertices: THREE.Vector3[] = [];
    for (let index = 0; index < brush.vertices.length; index++) {
      if (vertexUsed[index] !== 0) {
        const vertex = brush.vertices[vertexUsed[index]! - 1];
        if (vertex) {
          usedVertices.push(vertex.clone());
        }
      }
    }
    return usedVertices;
  }
}
