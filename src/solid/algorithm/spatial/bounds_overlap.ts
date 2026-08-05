import type * as THREE from 'three';

/** Minimal AABB used by padded overlap tests (THREE.Box3 compatible). */
export type AxisAlignedBounds = {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
};

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
