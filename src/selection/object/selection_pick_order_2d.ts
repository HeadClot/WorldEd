import type * as THREE from 'three';
import { compareSceneGraphOrder } from '@/utils/utils_hierarchy.js';

/**
 * Orders meshes under a 2D pointer by reverse outliner / scene-graph order
 * (last entry in the outliner first). Depth is ignored; only hierarchy order
 * among the hit set matters.
 *
 * @param hitMeshes Unique meshes under the pointer in any order.
 * @returns New array ordered last-to-first like the outliner tree walk.
 */
export function orderMeshesByReverseOutlinerOrder(hitMeshes: readonly THREE.Mesh[]): THREE.Mesh[] {
  if (hitMeshes.length <= 1) {
    return hitMeshes.slice();
  }
  return hitMeshes.slice().sort((left, right) => compareSceneGraphOrder(right, left));
}

/**
 * Returns the pick stack for click selection. Perspective (3D) keeps
 * near-to-far depth order unchanged. Orthographic (2D) reorders by reverse
 * outliner order.
 *
 * @param depthSortedMeshes Unique world meshes ordered near-to-far from
 *   raycast.
 * @param useReverseOutlinerOrder True for 2D orthographic viewports.
 * @returns Stack in pick-priority order (preferred first).
 */
export function orderObjectPickStackForViewport(
  depthSortedMeshes: THREE.Mesh[],
  useReverseOutlinerOrder: boolean,
): THREE.Mesh[] {
  if (!useReverseOutlinerOrder) {
    return depthSortedMeshes;
  }
  return orderMeshesByReverseOutlinerOrder(depthSortedMeshes);
}
