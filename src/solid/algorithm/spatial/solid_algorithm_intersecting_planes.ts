import type { SolidPlane } from '@/solid/brush/solid_plane.js';
import type { AxisAlignedBounds } from '@/solid/algorithm/spatial/bounds_overlap.js';
import { SOLID_FAT_PLANE_EPSILON } from '@/solid/algorithm/math/solid_math_constants.js';
import { SolidPlaneBounds } from '@/solid/algorithm/math/solid_plane_bounds.js';
import { SolidPlaneBoundsResult } from '@/solid/algorithm/math/solid_plane_bounds_result.js';
import { SolidAlgorithmIntersectionType } from '@/solid/algorithm/routing/solid_algorithm_intersection_type.js';

/**
 * PrepareBrushPairIntersectionsJob.GetIntersectingPlanes: builds the local
 * intersecting-plane index table for one brush of a pair. Planes that cannot
 * cut the other brush's bounds/vertices are dropped; if any plane fully
 * separates the other bounds, the table is empty (pair has no loops).
 */
export class SolidAlgorithmIntersectingPlanes {
  /**
   * Selects plane indices from sourcePlanes that may cut otherBounds /
   * otherVertices. When type is not Intersection, every plane is kept.
   *
   * @param type Pair intersection type.
   * @param sourcePlanes Planes of the brush being filtered (same space as
   *   otherBounds).
   * @param otherBounds Bounds of the other brush.
   * @param otherVertices Vertices of the other brush.
   * @param epsilon Fat-plane width.
   * @returns Indices into sourcePlanes, or empty when the pair is separated.
   */
  static collectIndices(
    type: SolidAlgorithmIntersectionType,
    sourcePlanes: readonly SolidPlane[],
    otherBounds: AxisAlignedBounds,
    otherVertices: readonly { x: number; y: number; z: number }[],
    epsilon: number = SOLID_FAT_PLANE_EPSILON,
  ): number[] {
    if (type !== SolidAlgorithmIntersectionType.Intersection) {
      return this.allPlaneIndices(sourcePlanes.length);
    }
    return this.collectIntersectingIndices(sourcePlanes, otherBounds, otherVertices, epsilon);
  }

  /**
   * Filters source planes for Intersection pairs (bounds early outs + vertex
   * straddle). Empty means the pair is separated.
   *
   * @param sourcePlanes Planes of the brush being filtered.
   * @param otherBounds Bounds of the other brush.
   * @param otherVertices Vertices of the other brush.
   * @param epsilon Fat-plane width.
   * @returns Indices into sourcePlanes, or empty when separated.
   */
  private static collectIntersectingIndices(
    sourcePlanes: readonly SolidPlane[],
    otherBounds: AxisAlignedBounds,
    otherVertices: readonly { x: number; y: number; z: number }[],
    epsilon: number,
  ): number[] {
    const indices: number[] = [];
    for (let planeIndex = 0; planeIndex < sourcePlanes.length; planeIndex++) {
      const decision = this.planePairDecision(sourcePlanes[planeIndex]!, otherBounds, otherVertices, epsilon);
      if (decision === 'separated') {
        return [];
      }
      if (decision === 'keep') {
        indices.push(planeIndex);
      }
    }
    return indices;
  }

  /**
   * Decides whether one plane separates, is unused, or cuts the other brush.
   *
   * @param plane Candidate plane.
   * @param otherBounds Other brush bounds.
   * @param otherVertices Other brush vertices.
   * @param epsilon Fat-plane width.
   * @returns Decision for this plane.
   */
  private static planePairDecision(
    plane: SolidPlane,
    otherBounds: AxisAlignedBounds,
    otherVertices: readonly { x: number; y: number; z: number }[],
    epsilon: number,
  ): 'separated' | 'skip' | 'keep' {
    const boundsSide = SolidPlaneBounds.classifyFat(plane, otherBounds, epsilon);
    if (boundsSide === SolidPlaneBoundsResult.Outside) {
      return 'separated';
    }
    if (boundsSide === SolidPlaneBoundsResult.Inside) {
      return 'skip';
    }
    if (!this.verticesStraddlePlane(plane, otherVertices, epsilon)) {
      return 'skip';
    }
    return 'keep';
  }

  /**
   * Collects the actual plane objects for a pair side using collectIndices.
   *
   * @param type Pair intersection type.
   * @param sourcePlanes Source brush planes.
   * @param otherBounds Other brush bounds.
   * @param otherVertices Other brush vertices.
   * @param epsilon Fat-plane width.
   * @returns Filtered planes, or empty when the pair is separated.
   */
  static collectPlanes(
    type: SolidAlgorithmIntersectionType,
    sourcePlanes: readonly SolidPlane[],
    otherBounds: AxisAlignedBounds,
    otherVertices: readonly { x: number; y: number; z: number }[],
    epsilon: number = SOLID_FAT_PLANE_EPSILON,
  ): SolidPlane[] {
    const indices = this.collectIndices(type, sourcePlanes, otherBounds, otherVertices, epsilon);
    const planes: SolidPlane[] = [];
    for (const index of indices) {
      planes.push(sourcePlanes[index]!);
    }
    return planes;
  }

  /**
   * Returns whether vertices are not entirely on one side of the plane.
   *
   * @param plane Candidate plane.
   * @param vertices Other brush vertices.
   * @param epsilon Fat-plane width.
   * @returns True when the plane may cut the vertex set.
   */
  private static verticesStraddlePlane(
    plane: SolidPlane,
    vertices: readonly { x: number; y: number; z: number }[],
    epsilon: number,
  ): boolean {
    if (vertices.length === 0) {
      return false;
    }
    let minDistance = Number.POSITIVE_INFINITY;
    let maxDistance = Number.NEGATIVE_INFINITY;
    for (const vertex of vertices) {
      const distance = plane.normal.x * vertex.x + plane.normal.y * vertex.y + plane.normal.z * vertex.z + plane.offset;
      if (distance < minDistance) {
        minDistance = distance;
      }
      if (distance > maxDistance) {
        maxDistance = distance;
      }
    }
    if (minDistance > epsilon || maxDistance < -epsilon) {
      return false;
    }
    return true;
  }

  /**
   * Builds [0, planeCount).
   *
   * @param planeCount Number of planes.
   * @returns Sequential indices.
   */
  private static allPlaneIndices(planeCount: number): number[] {
    const indices: number[] = [];
    for (let index = 0; index < planeCount; index++) {
      indices.push(index);
    }
    return indices;
  }
}
