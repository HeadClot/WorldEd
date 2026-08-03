import type * as THREE from 'three';
import { SolidBoundsOps } from '@/solid/algorithm/math/solid_bounds_ops.js';

/** Minimal AABB used by padded overlap tests (THREE.Box3 compatible). */
export type AxisAlignedBounds = {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
};

/**
 * Returns whether two axis-aligned bounds may touch when expanded by pad.
 * Delegates to SolidBoundsOps.intersects (Chisel BoundsExtensions.Intersects).
 *
 * @param a First bounds.
 * @param b Second bounds.
 * @param pad Symmetric padding along each axis.
 * @returns True when the padded boxes may overlap.
 */
export function boundsOverlapPadded(a: AxisAlignedBounds, b: AxisAlignedBounds, pad: number): boolean {
  return SolidBoundsOps.intersects(a, b, pad);
}

/**
 * Returns whether a padded AABB contains a point.
 *
 * @param bounds Axis-aligned bounds.
 * @param point Sample point.
 * @param pad Symmetric padding along each axis.
 * @returns True when the point lies inside the expanded box.
 */
export function boundsContainPointPadded(bounds: AxisAlignedBounds, point: THREE.Vector3, pad: number): boolean {
  return (
    point.x >= bounds.min.x - pad &&
    point.x <= bounds.max.x + pad &&
    point.y >= bounds.min.y - pad &&
    point.y <= bounds.max.y + pad &&
    point.z >= bounds.min.z - pad &&
    point.z <= bounds.max.z + pad
  );
}
