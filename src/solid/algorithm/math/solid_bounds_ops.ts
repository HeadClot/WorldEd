import type { AxisAlignedBounds } from '@/solid/algorithm/spatial/bounds_overlap.js';
import { SOLID_BOUNDS_EPSILON } from './solid_math_constants.js';

/**
 * Axis-aligned bounds operations matching BoundsExtensions (MinMaxAABB
 * intersects with epsilon, validity checks).
 */
export class SolidBoundsOps {
  /**
   * Returns whether two bounds may touch when expanded by epsilon on each side.
   * Matches BoundsExtensions.Intersects(MinMaxAABB, MinMaxAABB, epsilon).
   *
   * @param left First bounds.
   * @param right Second bounds.
   * @param epsilon Separation tolerance (default kBoundsDistanceEpsilon).
   * @returns True when the bounds overlap or touch within epsilon.
   */
  static intersects(
    left: AxisAlignedBounds,
    right: AxisAlignedBounds,
    epsilon: number = SOLID_BOUNDS_EPSILON,
  ): boolean {
    return (
      right.max.x - left.min.x >= -epsilon &&
      left.max.x - right.min.x >= -epsilon &&
      right.max.y - left.min.y >= -epsilon &&
      left.max.y - right.min.y >= -epsilon &&
      right.max.z - left.min.z >= -epsilon &&
      left.max.z - right.min.z >= -epsilon
    );
  }

  /**
   * Returns whether min/max form a finite non-degenerate box.
   *
   * @param min Bounds minimum corner.
   * @param max Bounds maximum corner.
   * @returns True when the box is valid for CSG tests.
   */
  static isValid(min: { x: number; y: number; z: number }, max: { x: number; y: number; z: number }): boolean {
    const minSize = 0.0001;
    if (Math.abs(max.x - min.x) < minSize || Math.abs(max.y - min.y) < minSize || Math.abs(max.z - min.z) < minSize) {
      return false;
    }
    if (!Number.isFinite(min.x) || !Number.isFinite(min.y) || !Number.isFinite(min.z)) {
      return false;
    }
    if (!Number.isFinite(max.x) || !Number.isFinite(max.y) || !Number.isFinite(max.z)) {
      return false;
    }
    return true;
  }
}
