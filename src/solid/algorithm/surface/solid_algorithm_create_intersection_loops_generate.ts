import * as THREE from 'three';
import type { SolidPlane } from '@/solid/brush/solid_plane.js';
import { HashedVertexTable } from '@/solid/algorithm/spatial/hashed_vertex_table.js';
import { SolidAlgorithmCreateIntersectionLoopsSort } from './solid_algorithm_create_intersection_loops_sort.js';
import type { SolidAlgorithmPlaneVertexIndexPair } from './solid_algorithm_plane_vertex_index_pair.js';
import type { SolidAlgorithmSurfaceInfo } from './solid_algorithm_surface_info.js';
import { solidAlgorithmSurfaceLoopCreate, type SolidAlgorithmSurfaceLoop } from './solid_algorithm_surface_loop.js';

interface PlaneIndexOffsetLength {
  length: number;
  offset: number;
  planeIndex: number;
}

/** Groups found plane/vertex pairs into sorted convex loops. */
export class SolidAlgorithmCreateIntersectionLoopsGenerate {
  /**
   * Generates surface loops for one brush side of a pair.
   *
   * @param subjectBrushIndex Brush that owns the base faces (indexOrder0).
   * @param peerBrushIndex Other brush (indexOrder1).
   * @param invertedTransform True when subject transform determinant is
   *   negative.
   * @param surfaceInfos Per-face surface infos of the subject.
   * @param brushTreeSpacePlanes Subject face planes (model space).
   * @param foundIndices Plane/vertex pairs for the subject.
   * @param hashedTreeSpaceVertices Shared vertex table for this pair.
   * @param output Accumulator for loops.
   */
  static generate(
    subjectBrushIndex: number,
    peerBrushIndex: number,
    invertedTransform: boolean,
    surfaceInfos: readonly SolidAlgorithmSurfaceInfo[],
    brushTreeSpacePlanes: readonly SolidPlane[],
    foundIndices: SolidAlgorithmPlaneVertexIndexPair[],
    hashedTreeSpaceVertices: HashedVertexTable,
    output: SolidAlgorithmSurfaceLoop[],
  ): void {
    if (foundIndices.length < 3) {
      return;
    }
    this.sortFoundIndices(foundIndices);
    const { uniqueIndices, planeIndexOffsets } = this.segmentByPlane(foundIndices);
    this.sortEachSegment(
      uniqueIndices,
      planeIndexOffsets,
      hashedTreeSpaceVertices,
      brushTreeSpacePlanes,
      invertedTransform,
    );
    this.emitLoops(
      subjectBrushIndex,
      peerBrushIndex,
      surfaceInfos,
      uniqueIndices,
      planeIndexOffsets,
      hashedTreeSpaceVertices,
      output,
    );
  }

  /**
   * Bubble-sorts found indices by planeIndex then vertexIndex.
   *
   * @param foundIndices Pairs to sort in place.
   */
  private static sortFoundIndices(foundIndices: SolidAlgorithmPlaneVertexIndexPair[]): void {
    for (let i = 0; i < foundIndices.length - 1; i++) {
      for (let j = i + 1; j < foundIndices.length; j++) {
        if (this.shouldSwap(foundIndices[i]!, foundIndices[j]!)) {
          const temp = foundIndices[i]!;
          foundIndices[i] = foundIndices[j]!;
          foundIndices[j] = temp;
        }
      }
    }
  }

  /**
   * Returns true when x should be swapped after y for ascending plane/vertex.
   *
   * @param x Left pair.
   * @param y Right pair.
   * @returns True when swap is needed.
   */
  private static shouldSwap(x: SolidAlgorithmPlaneVertexIndexPair, y: SolidAlgorithmPlaneVertexIndexPair): boolean {
    if (x.planeIndex > y.planeIndex) {
      return false;
    }
    if (x.planeIndex === y.planeIndex) {
      return x.vertexIndex > y.vertexIndex;
    }
    return true;
  }

  /**
   * Segments sorted pairs into unique vertex runs per plane.
   *
   * @param foundIndices Sorted pairs.
   * @returns Unique indices and plane offset descriptors.
   */
  private static segmentByPlane(foundIndices: readonly SolidAlgorithmPlaneVertexIndexPair[]): {
    uniqueIndices: number[];
    planeIndexOffsets: PlaneIndexOffsetLength[];
  } {
    const uniqueIndices: number[] = [];
    const planeIndexOffsets: PlaneIndexOffsetLength[] = [];
    let previousPlaneIndex = foundIndices[0]!.planeIndex;
    let previousVertexIndex = foundIndices[0]!.vertexIndex;
    uniqueIndices.push(previousVertexIndex);
    let loopStart = 0;
    for (let index = 1; index < foundIndices.length; index++) {
      const pair = foundIndices[index]!;
      if (pair.planeIndex === previousPlaneIndex && pair.vertexIndex === previousVertexIndex) {
        continue;
      }
      if (pair.planeIndex !== previousPlaneIndex) {
        this.closePlaneSegment(uniqueIndices, planeIndexOffsets, loopStart, previousPlaneIndex);
        loopStart = uniqueIndices.length;
      }
      uniqueIndices.push(pair.vertexIndex);
      previousVertexIndex = pair.vertexIndex;
      previousPlaneIndex = pair.planeIndex;
    }
    this.closePlaneSegment(uniqueIndices, planeIndexOffsets, loopStart, previousPlaneIndex);
    return { uniqueIndices, planeIndexOffsets };
  }

  /**
   * Finalizes one plane segment when it has more than two unique vertices.
   *
   * @param uniqueIndices Unique vertex indices.
   * @param planeIndexOffsets Segment list.
   * @param loopStart Start offset of this segment.
   * @param planeIndex Plane index.
   */
  private static closePlaneSegment(
    uniqueIndices: number[],
    planeIndexOffsets: PlaneIndexOffsetLength[],
    loopStart: number,
    planeIndex: number,
  ): void {
    const length = this.removeDuplicateEdges(uniqueIndices, loopStart, uniqueIndices.length);
    if (length > 2) {
      planeIndexOffsets.push({
        length,
        offset: loopStart,
        planeIndex,
      });
    }
  }

  /**
   * Removes A-B-A duplicate edge patterns at segment ends. Returns usable
   * length; may leave tail data unused.
   *
   * @param uniqueIndices Index list (mutated).
   * @param start Segment start.
   * @param end Segment end exclusive.
   * @returns Effective length after cleanup.
   */
  private static removeDuplicateEdges(uniqueIndices: number[], start: number, end: number): number {
    let length = end - start;
    if (length <= 2) {
      return 0;
    }
    let indexA = end - 1;
    let indexB = start;
    let indexC = start + 1;
    while (indexA >= start) {
      const vertexIndexA = uniqueIndices[indexA]!;
      const vertexIndexC = uniqueIndices[indexC]!;
      if (vertexIndexA !== vertexIndexC) {
        indexC = indexB;
        indexB = indexA;
        indexA--;
        continue;
      }
      length -= 2;
      if (length <= 2) {
        return 0;
      }
      const removed = this.removeAbaTriplet(uniqueIndices, start, end, indexA, indexC);
      end = removed.end;
      indexA = removed.indexA;
      indexB = indexA + 1;
      if (indexB >= end) {
        indexB = start;
      }
      indexC = indexB + 1;
      if (indexC >= end) {
        indexC = start;
      }
    }
    return length;
  }

  /**
   * Removes one A-B-A triplet from uniqueIndices.
   *
   * @param uniqueIndices Index list.
   * @param start Segment start.
   * @param end Segment end.
   * @param indexA Index of A.
   * @param indexC Index of C (same vertex as A).
   * @returns New end and indexA.
   */
  private static removeAbaTriplet(
    uniqueIndices: number[],
    start: number,
    end: number,
    indexA: number,
    indexC: number,
  ): { end: number; indexA: number } {
    if (indexC > end - 2) {
      uniqueIndices.splice(start, 0);
      const moveCount = end - (indexC + 1);
      for (let i = 0; i < moveCount; i++) {
        uniqueIndices[start + i] = uniqueIndices[indexC + 1 + i]!;
      }
      return { end: end - 2, indexA: indexA - 2 };
    }
    if (indexC < end - 2) {
      const moveCount = end - (indexC + 1);
      for (let i = 0; i < moveCount; i++) {
        uniqueIndices[indexA + i] = uniqueIndices[indexC + 1 + i]!;
      }
      return { end: end - 2, indexA };
    }
    return { end: end - 2, indexA };
  }

  /**
   * Sorts vertices within each plane segment by polar angle.
   *
   * @param uniqueIndices Index array.
   * @param planeIndexOffsets Segments.
   * @param hashedTreeSpaceVertices Vertex table.
   * @param brushTreeSpacePlanes Face planes.
   * @param invertedTransform Determinant sign flag.
   */
  private static sortEachSegment(
    uniqueIndices: number[],
    planeIndexOffsets: readonly PlaneIndexOffsetLength[],
    hashedTreeSpaceVertices: HashedVertexTable,
    brushTreeSpacePlanes: readonly SolidPlane[],
    invertedTransform: boolean,
  ): void {
    for (let index = planeIndexOffsets.length - 1; index >= 0; index--) {
      const segment = planeIndexOffsets[index]!;
      const plane = brushTreeSpacePlanes[segment.planeIndex];
      if (!plane) {
        continue;
      }
      const normalScale = invertedTransform ? 1 : -1;
      const normal = plane.normal.clone().multiplyScalar(normalScale);
      SolidAlgorithmCreateIntersectionLoopsSort.sortIndices(
        hashedTreeSpaceVertices,
        uniqueIndices,
        segment.offset,
        segment.length,
        normal,
      );
    }
  }

  /**
   * Emits BrushIntersectionLoop records for each valid segment.
   *
   * @param subjectBrushIndex Subject brush.
   * @param peerBrushIndex Peer brush.
   * @param surfaceInfos Subject surface infos.
   * @param uniqueIndices Vertex indices.
   * @param planeIndexOffsets Segments.
   * @param hashedTreeSpaceVertices Vertex table.
   * @param output Loop accumulator.
   */
  private static emitLoops(
    subjectBrushIndex: number,
    peerBrushIndex: number,
    surfaceInfos: readonly SolidAlgorithmSurfaceInfo[],
    uniqueIndices: readonly number[],
    planeIndexOffsets: readonly PlaneIndexOffsetLength[],
    hashedTreeSpaceVertices: HashedVertexTable,
    output: SolidAlgorithmSurfaceLoop[],
  ): void {
    for (const segment of planeIndexOffsets) {
      const surfaceInfo = surfaceInfos[segment.planeIndex];
      if (!surfaceInfo) {
        continue;
      }
      const loopVertices: THREE.Vector3[] = [];
      for (let d = 0; d < segment.length; d++) {
        loopVertices.push(hashedTreeSpaceVertices.get(uniqueIndices[segment.offset + d]!).clone());
      }
      output.push(solidAlgorithmSurfaceLoopCreate(subjectBrushIndex, peerBrushIndex, surfaceInfo, loopVertices));
    }
  }
}
