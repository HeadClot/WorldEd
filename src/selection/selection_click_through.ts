import * as THREE from 'three';
import { SelectionManager } from '../managers/selection_manager.js';

/**
 * Resolves object picks along a ray so nested meshes can be selected by
 * repeated clicks (frontmost first, then deeper hits, then wrap around).
 */
export class SelectionClickThrough {
  /**
   * Chooses which mesh a plain click should select from a depth-sorted stack.
   * When the frontmost (or currently selected) hit is already selected, the
   * next mesh behind it is returned so nested volumes remain reachable.
   * @param depthSortedMeshes Unique world meshes ordered near-to-far.
   * @param selectionManager Current selection state.
   * @returns Mesh to select, or null when the stack is empty.
   */
  static pickFromStack(
    depthSortedMeshes: THREE.Mesh[],
    selectionManager: SelectionManager
  ): THREE.Mesh | null {
    if (depthSortedMeshes.length === 0) return null;
    if (depthSortedMeshes.length === 1) return depthSortedMeshes[0];
    const currentIndex = this.findSelectedIndex(
      depthSortedMeshes,
      selectionManager
    );
    if (currentIndex < 0) return depthSortedMeshes[0];
    const nextIndex = (currentIndex + 1) % depthSortedMeshes.length;
    return depthSortedMeshes[nextIndex];
  }

  /**
   * Builds a near-to-far list of unique meshes from raycast hits.
   * @param hits Ray intersections sorted by distance (Three.js order).
   * @param resolveMesh Maps a hit mesh (possibly a 2D clone) to world mesh.
   * @returns Deduplicated world meshes in hit order.
   */
  static uniqueMeshesFromHits(
    hits: THREE.Intersection[],
    resolveMesh: (mesh: THREE.Mesh) => THREE.Mesh
  ): THREE.Mesh[] {
    const result: THREE.Mesh[] = [];
    const seen = new Set<THREE.Mesh>();
    for (const hit of hits) {
      if (!(hit.object instanceof THREE.Mesh)) continue;
      const resolved = resolveMesh(hit.object);
      if (seen.has(resolved)) continue;
      seen.add(resolved);
      result.push(resolved);
    }
    return result;
  }

  /**
   * Finds the index of a currently selected mesh in the pick stack.
   * Prefers the most recently selected mesh when several are selected.
   * @param depthSortedMeshes Unique world meshes ordered near-to-far.
   * @param selectionManager Current selection state.
   * @returns Index in the stack, or -1 when none of the hits are selected.
   */
  private static findSelectedIndex(
    depthSortedMeshes: THREE.Mesh[],
    selectionManager: SelectionManager
  ): number {
    const lastSelected = selectionManager.getLastSelectedObject();
    if (lastSelected) {
      const lastIndex = depthSortedMeshes.indexOf(lastSelected);
      if (lastIndex >= 0) return lastIndex;
    }
    for (let index = 0; index < depthSortedMeshes.length; index++) {
      if (selectionManager.isObjectSelected(depthSortedMeshes[index])) {
        return index;
      }
    }
    return -1;
  }
}
