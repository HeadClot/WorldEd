import type * as THREE from 'three';
import { getDescendants } from '@/utils/utils_hierarchy.js';
import { isEditorHelperObject } from '@/utils/mesh_edge_sync.js';

/**
 * Returns hierarchy children that are real content, not editor helpers.
 *
 * @param parent Parent object.
 * @returns Content children only.
 */
export function getOutlinerContentChildren(parent: THREE.Object3D): THREE.Object3D[] {
  return parent.children.filter((child) => !isEditorHelperObject(child));
}

/**
 * Checks whether an object passes the current search filter.
 *
 * @param obj The object to test.
 * @param query The lowercase search query string.
 * @returns True if the object matches or has matching descendants.
 */
export function outlinerPassesSearchFilter(obj: THREE.Object3D, query: string): boolean {
  if (!query) {
    return true;
  }
  const nameMatch = (obj.name || '').toLowerCase().includes(query);
  if (nameMatch) {
    return true;
  }
  const descendants = getDescendants(obj);
  return descendants.some((descendant) => (descendant.name || '').toLowerCase().includes(query));
}

/**
 * Computes indentation depth for an object relative to the tree root.
 *
 * @param object Hierarchy object.
 * @param root Outliner root object.
 * @returns Depth starting at 0 for direct root children, or -1 if orphaned.
 */
export function computeOutlinerDepth(object: THREE.Object3D, root: THREE.Object3D): number {
  let depth = 0;
  let current: THREE.Object3D | null = object.parent;
  while (current && current !== root) {
    depth++;
    current = current.parent;
  }
  return current === root ? depth : -1;
}
