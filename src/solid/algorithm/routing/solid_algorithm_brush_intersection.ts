import * as THREE from 'three';
import type { PreparedBrush } from '@/solid/algorithm/compile/solid_compile_types.js';
import type { SolidPlane } from '@/solid/brush/solid_plane.js';
import { boundsOverlapPadded } from '@/solid/algorithm/spatial/bounds_overlap.js';
import { SOLID_ALGORITHM_INFINITE_PREPARED_INDEX } from './solid_algorithm_compact_node.js';
import { SolidAlgorithmIntersectionType } from './solid_algorithm_intersection_type.js';

/**
 * Classifies how two prepared brushes (or the infinite inverted brush) touch,
 * matching Chisel ConvexPolytopeTouching / IntersectionType.
 *
 * BInsideA / AInsideB require every vertex of the inner brush to lie strictly
 * inside every outer plane (Chisel WhichSide all-negative). On-plane contact is
 * Intersection so flush openings still receive cut planes.
 */
export class SolidAlgorithmBrushIntersection {
  private static readonly scratchPoint = new THREE.Vector3();

  /**
   * Returns the intersection type of other relative to the processed subject.
   *
   * @param subject Prepared subject brush.
   * @param otherPreparedIndex Other prepared index, or infinite index.
   * @param prepared All prepared brushes.
   * @param boundsPad Bounds padding.
   * @param membershipEpsilon Plane epsilon (Chisel kBoundsDistanceEpsilon).
   * @returns Intersection type for CreateRoutingTableJob.
   */
  static classify(
    subject: PreparedBrush,
    otherPreparedIndex: number,
    prepared: readonly PreparedBrush[],
    boundsPad: number,
    membershipEpsilon: number,
  ): SolidAlgorithmIntersectionType {
    if (otherPreparedIndex === SOLID_ALGORITHM_INFINITE_PREPARED_INDEX) {
      return SolidAlgorithmIntersectionType.AInsideB;
    }
    const other = prepared[otherPreparedIndex];
    if (!other) {
      return SolidAlgorithmIntersectionType.NoIntersection;
    }
    if (other.instance.id === subject.instance.id) {
      return SolidAlgorithmIntersectionType.Intersection;
    }
    if (!boundsOverlapPadded(subject.bounds, other.bounds, boundsPad)) {
      return SolidAlgorithmIntersectionType.NoIntersection;
    }
    return this.convexPolytopeTouching(subject, other, membershipEpsilon);
  }

  /**
   * Chisel ConvexPolytopeTouching: peer-inside-subject first, then
   * subject-inside-peer, else Intersection when bounds already overlap.
   *
   * @param subject Processed subject brush (brush0).
   * @param other Other brush (brush1).
   * @param epsilon Bounds distance epsilon.
   * @returns Intersection type.
   */
  private static convexPolytopeTouching(
    subject: PreparedBrush,
    other: PreparedBrush,
    epsilon: number,
  ): SolidAlgorithmIntersectionType {
    const otherVsSubject = this.classifyVerticesAgainstPlanes(other, subject, epsilon);
    if (otherVsSubject === 'separated') {
      return SolidAlgorithmIntersectionType.NoIntersection;
    }
    if (otherVsSubject === 'strictlyInside') {
      return SolidAlgorithmIntersectionType.BInsideA;
    }
    const subjectVsOther = this.classifyVerticesAgainstPlanes(subject, other, epsilon);
    if (subjectVsOther === 'separated') {
      return SolidAlgorithmIntersectionType.NoIntersection;
    }
    if (subjectVsOther === 'strictlyInside') {
      return SolidAlgorithmIntersectionType.AInsideB;
    }
    return SolidAlgorithmIntersectionType.Intersection;
  }

  /**
   * Classifies all vertices of inner against outer planes (Chisel WhichSide
   * over every plane).
   *
   * @param inner Brush whose vertices are tested.
   * @param outer Brush providing outward planes.
   * @param epsilon Plane epsilon.
   * @returns Separated | strictlyInside | straddling.
   */
  private static classifyVerticesAgainstPlanes(
    inner: PreparedBrush,
    outer: PreparedBrush,
    epsilon: number,
  ): 'separated' | 'strictlyInside' | 'straddling' {
    let strictNegativePlaneCount = 0;
    for (const plane of outer.brush.planes) {
      const side = this.whichSide(inner, plane, epsilon);
      if (side > 0) {
        return 'separated';
      }
      if (side < 0) {
        strictNegativePlaneCount++;
      }
    }
    if (strictNegativePlaneCount === outer.brush.planes.length && outer.brush.planes.length > 0) {
      return 'strictlyInside';
    }
    return 'straddling';
  }

  /**
   * Chisel WhichSide: -1 all strictly negative, +1 all strictly positive, 0
   * mixed or on-plane.
   *
   * @param brush Brush whose vertices are tested.
   * @param plane Outer plane.
   * @param epsilon Distance epsilon.
   * @returns -1, 0, or +1.
   */
  private static whichSide(brush: PreparedBrush, plane: SolidPlane, epsilon: number): number {
    if (brush.brush.vertices.length === 0) {
      return 0;
    }
    this.scratchPoint.copy(brush.brush.vertices[0]!);
    const first = plane.signedDistance(this.scratchPoint);
    if (first >= epsilon) {
      return this.allVerticesPositive(brush, plane, epsilon) ? 1 : 0;
    }
    if (first <= -epsilon) {
      return this.allVerticesNegative(brush, plane, epsilon) ? -1 : 0;
    }
    return 0;
  }

  /**
   * Returns whether every vertex is strictly on the positive side of the plane.
   *
   * @param brush Brush vertices.
   * @param plane Plane.
   * @param epsilon Distance epsilon.
   * @returns True when all vertices are strictly positive.
   */
  private static allVerticesPositive(brush: PreparedBrush, plane: SolidPlane, epsilon: number): boolean {
    for (let index = 1; index < brush.brush.vertices.length; index++) {
      this.scratchPoint.copy(brush.brush.vertices[index]!);
      if (plane.signedDistance(this.scratchPoint) < epsilon) {
        return false;
      }
    }
    return true;
  }

  /**
   * Returns whether every vertex is strictly on the negative side of the plane.
   *
   * @param brush Brush vertices.
   * @param plane Plane.
   * @param epsilon Distance epsilon.
   * @returns True when all vertices are strictly negative.
   */
  private static allVerticesNegative(brush: PreparedBrush, plane: SolidPlane, epsilon: number): boolean {
    for (let index = 1; index < brush.brush.vertices.length; index++) {
      this.scratchPoint.copy(brush.brush.vertices[index]!);
      if (plane.signedDistance(this.scratchPoint) > -epsilon) {
        return false;
      }
    }
    return true;
  }
}
