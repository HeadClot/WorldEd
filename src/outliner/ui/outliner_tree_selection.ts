import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';

/**
 * Computes whether a hierarchy row should appear selected. Hierarchy selection
 * always wins. Groups only highlight when hierarchy-selected. Mesh rows hide
 * their highlight when an ancestor group owns the hierarchy selection.
 *
 * @param obj Row object.
 * @param selectedObjects Selected meshes.
 * @param hierarchySelection Outliner hierarchy selection.
 * @returns True when the row should highlight.
 */
export function computeOutlinerRowSelected(
  obj: THREE.Object3D,
  selectedObjects: Set<THREE.Mesh>,
  hierarchySelection: Set<THREE.Object3D>,
): boolean {
  if (hierarchySelection.has(obj)) {
    return true;
  }
  if (SolidModel.isSolidModelObject(obj)) {
    return false;
  }
  if (obj instanceof THREE.Group) {
    return false;
  }
  if (obj instanceof THREE.Mesh) {
    return isOutlinerMeshRowHighlighted(obj, selectedObjects, hierarchySelection);
  }
  return false;
}

/**
 * Returns whether a mesh row should show selection orange.
 *
 * @param mesh Mesh row object.
 * @param selectedObjects Selected meshes.
 * @param hierarchySelection Outliner hierarchy selection.
 * @returns True when the mesh is selected and no ancestor owns hierarchy
 *   selection.
 */
export function isOutlinerMeshRowHighlighted(
  mesh: THREE.Mesh,
  selectedObjects: Set<THREE.Mesh>,
  hierarchySelection: Set<THREE.Object3D>,
): boolean {
  if (!selectedObjects.has(mesh)) {
    return false;
  }
  if (hasOutlinerHierarchySelectedAncestor(mesh, hierarchySelection)) {
    return false;
  }
  return true;
}

/**
 * Returns whether any ancestor of an object is in the hierarchy selection.
 *
 * @param obj Object whose ancestors are checked.
 * @param hierarchySelection Outliner hierarchy selection.
 * @returns True when a parent (or higher) is hierarchy-selected.
 */
export function hasOutlinerHierarchySelectedAncestor(
  obj: THREE.Object3D,
  hierarchySelection: Set<THREE.Object3D>,
): boolean {
  if (hierarchySelection.size === 0) {
    return false;
  }
  let current: THREE.Object3D | null = obj.parent;
  while (current) {
    if (hierarchySelection.has(current)) {
      return true;
    }
    current = current.parent;
  }
  return false;
}
