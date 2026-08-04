import type { SolidPlane } from '@/solid/brush/solid_plane.js';
import type { AxisAlignedBounds } from '@/solid/algorithm/spatial/bounds_overlap.js';
import { SOLID_FAT_PLANE_EPSILON, SOLID_PLANE_CUT_EPSILON } from './solid_math_constants.js';
import { SolidPlaneBoundsResult } from './solid_plane_bounds_result.js';

/**
 * Plane versus axis-aligned bounds early-out tests matching MathExtensions
 * IsInside / IsOutside / Intersection.
 */
export class SolidPlaneBounds {
  /**
   * Returns whether the entire bounds lies strictly inside the plane half-space
   * (negative side). Matches Plane.IsInside(Bounds).
   *
   * @param plane Plane (positive = outside for outward solid planes).
   * @param bounds Axis-aligned bounds.
   * @param epsilon Distance epsilon (default kDistanceEpsilon).
   * @returns True when every bounds corner is strictly inside.
   */
  static isInside(plane: SolidPlane, bounds: AxisAlignedBounds, epsilon: number = SOLID_PLANE_CUT_EPSILON): boolean {
    const normal = plane.normal;
    const x = normal.x < 0 ? bounds.min.x : bounds.max.x;
    const y = normal.y < 0 ? bounds.min.y : bounds.max.y;
    const z = normal.z < 0 ? bounds.min.z : bounds.max.z;
    const distance = normal.x * x + normal.y * y + normal.z * z + plane.offset;
    return distance < -epsilon;
  }

  /**
   * Returns whether the entire bounds lies strictly outside the plane
   * half-space (positive side). Matches Plane.IsOutside(Bounds).
   *
   * @param plane Plane (positive = outside).
   * @param bounds Axis-aligned bounds.
   * @param epsilon Distance epsilon (default kDistanceEpsilon).
   * @returns True when every bounds corner is strictly outside.
   */
  static isOutside(plane: SolidPlane, bounds: AxisAlignedBounds, epsilon: number = SOLID_PLANE_CUT_EPSILON): boolean {
    const normal = plane.normal;
    const x = normal.x >= 0 ? bounds.min.x : bounds.max.x;
    const y = normal.y >= 0 ? bounds.min.y : bounds.max.y;
    const z = normal.z >= 0 ? bounds.min.z : bounds.max.z;
    const distance = normal.x * x + normal.y * y + normal.z * z + plane.offset;
    return distance > epsilon;
  }

  /**
   * Classifies bounds against a plane as Outside, Inside, or Intersecting.
   * Matches Plane.Intersection(Bounds).
   *
   * @param plane Plane (positive = outside).
   * @param bounds Axis-aligned bounds.
   * @param epsilon Distance epsilon (default kDistanceEpsilon).
   * @returns Classification for early outs.
   */
  static classify(
    plane: SolidPlane,
    bounds: AxisAlignedBounds,
    epsilon: number = SOLID_PLANE_CUT_EPSILON,
  ): SolidPlaneBoundsResult {
    const normal = plane.normal;
    const forwardX = normal.x < 0 ? bounds.max.x : bounds.min.x;
    const forwardY = normal.y < 0 ? bounds.max.y : bounds.min.y;
    const forwardZ = normal.z < 0 ? bounds.max.z : bounds.min.z;
    const forward = normal.x * forwardX + normal.y * forwardY + normal.z * forwardZ + plane.offset;
    if (forward > epsilon) {
      return SolidPlaneBoundsResult.Outside;
    }
    const backwardX = normal.x >= 0 ? bounds.max.x : bounds.min.x;
    const backwardY = normal.y >= 0 ? bounds.max.y : bounds.min.y;
    const backwardZ = normal.z >= 0 ? bounds.max.z : bounds.min.z;
    const backward = normal.x * backwardX + normal.y * backwardY + normal.z * backwardZ + plane.offset;
    if (backward < -epsilon) {
      return SolidPlaneBoundsResult.Inside;
    }
    return SolidPlaneBoundsResult.Intersecting;
  }

  /**
   * Fat-plane classification used by GetIntersectingPlanes. Outside means the
   * pair is separated by this plane.
   *
   * @param plane Candidate plane.
   * @param bounds Bounds of the other brush (same space as the plane).
   * @param epsilon Fat-plane width (default kFatPlaneWidthEpsilon).
   * @returns Classification with fat epsilon.
   */
  static classifyFat(
    plane: SolidPlane,
    bounds: AxisAlignedBounds,
    epsilon: number = SOLID_FAT_PLANE_EPSILON,
  ): SolidPlaneBoundsResult {
    return this.classify(plane, bounds, epsilon);
  }
}
