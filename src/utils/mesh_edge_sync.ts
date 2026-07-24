import * as THREE from 'three';
import { Theme } from '../theme.js';
import { SELECTION_HIGHLIGHT_USERDATA_KEY } from '../selection/selection_highlight.js';
import {
  BRUSH_EDGE_SHARED_MATERIAL_KEY,
  SOLID_BRUSH_EDGE_USERDATA_KEY,
} from '../solid/model/solid_brush_edge_materials.js';

/**
 * UserData flag marking content decorative edge wireframes (white outlines).
 * Not used for solid brush helpers or CSG result meshes.
 */
export const DECORATIVE_EDGE_USERDATA_KEY = 'isDecorativeEdge';

/**
 * UserData keys that mark meshes which must never receive content outline edges.
 * Kept as literals here to avoid circular imports with solid modules; must match
 * SOLID_BRUSH_USERDATA_KEY / SOLID_MODEL_RESULT_USERDATA_KEY in solid model code.
 */
const SKIP_CONTENT_EDGE_MESH_KEYS = ['isSolidBrush', 'isSolidModelResult'] as const;

/**
 * Rebuilds content decorative edge LineSegments for a mesh from its geometry.
 * No-ops for solid brush previews and solid CSG result meshes (they use other systems).
 * @param mesh The mesh whose content edges should match its geometry.
 * @param edgeColor Optional edge color (defaults to theme box edge color).
 */
export function rebuildDecorativeEdges(
  mesh: THREE.Mesh,
  edgeColor: number = Theme.boxEdgeColor,
): void {
  if (!usesContentDecorativeEdges(mesh)) {
    removeDecorativeEdges(mesh);
    return;
  }
  removeDecorativeEdges(mesh);
  if (!hasEdgeBuildableGeometry(mesh)) return;
  const edges = new THREE.EdgesGeometry(mesh.geometry, 1);
  const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: edgeColor }));
  line.userData[DECORATIVE_EDGE_USERDATA_KEY] = true;
  mesh.add(line);
}

/**
 * Returns whether a mesh should carry white content outline edges.
 * Solid brush helpers use colored dual-pass edges; CSG results use surface materials only.
 * @param mesh Candidate mesh.
 * @returns True for ordinary content meshes.
 */
export function usesContentDecorativeEdges(mesh: THREE.Mesh): boolean {
  for (const key of SKIP_CONTENT_EDGE_MESH_KEYS) {
    if (mesh.userData[key] === true) return false;
  }
  return true;
}

/**
 * Returns whether a mesh has a position attribute suitable for EdgesGeometry.
 * @param mesh Candidate mesh.
 * @returns True when at least three position vertices exist.
 */
export function hasEdgeBuildableGeometry(mesh: THREE.Mesh): boolean {
  if (!mesh.geometry) return false;
  const position = mesh.geometry.getAttribute('position');
  return !!position && position.count >= 3;
}

/**
 * Removes decorative edge children from a mesh and disposes their resources.
 * @param mesh The mesh to clean.
 */
export function removeDecorativeEdges(mesh: THREE.Mesh): void {
  const toRemove = mesh.children.filter((child) => isDecorativeEdge(child));
  toRemove.forEach((child) => {
    mesh.remove(child);
    disposeLineObject(child);
  });
}

/**
 * Removes selection and wireframe overlay children that should not persist
 * across geometry replacement (they are recreated by their owners).
 * @param mesh The mesh to clean.
 */
export function stripEditorOverlayChildren(mesh: THREE.Mesh): void {
  const toRemove = mesh.children.filter((child) => isEditorOverlayChild(child));
  toRemove.forEach((child) => {
    mesh.remove(child);
    disposeLineObject(child);
  });
}

/**
 * Prepares a geometry for hard-edge (flat) shading used by the world editor.
 * Converts to non-indexed triangles so each face has independent normals.
 * Does not dispose the input geometry (caller owns that reference).
 * @param geometry The source geometry (may be indexed).
 * @returns A flat-shaded non-indexed geometry ready for a mesh.
 */
export function prepareFlatShadedGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const source = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  source.computeVertexNormals();
  source.computeBoundingSphere();
  source.computeBoundingBox();
  return source;
}

/**
 * Applies flat shading to a mesh material when supported.
 * @param mesh The mesh whose material should use flat shading.
 */
export function enableFlatShadingOnMesh(mesh: THREE.Mesh): void {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  materials.forEach((material) => {
    if (!material) return;
    if ('flatShading' in material) {
      (material as THREE.MeshStandardMaterial).flatShading = true;
      material.needsUpdate = true;
    }
  });
}

/**
 * Returns true for content decorative edge line children (white outlines).
 * Solid brush edge helpers are excluded; they use SOLID_BRUSH_EDGE_USERDATA_KEY.
 * @param object The child object to test.
 * @returns True if the object is a content decorative edge outline.
 */
export function isDecorativeEdge(object: THREE.Object3D): boolean {
  if (!(object instanceof THREE.LineSegments)) return false;
  if (object.userData[SOLID_BRUSH_EDGE_USERDATA_KEY] === true) return false;
  return object.userData[DECORATIVE_EDGE_USERDATA_KEY] === true;
}

/**
 * Returns true for solid brush dual-pass edge line children.
 * @param object The child object to test.
 * @returns True if the object is a brush volume edge helper.
 */
export function isSolidBrushEdge(object: THREE.Object3D): boolean {
  if (!(object instanceof THREE.LineSegments)) return false;
  return object.userData[SOLID_BRUSH_EDGE_USERDATA_KEY] === true;
}

/**
 * Returns true for selection/wireframe overlay children.
 * @param object The child object to test.
 * @returns True if the object is an editor overlay.
 */
function isEditorOverlayChild(object: THREE.Object3D): boolean {
  if (object.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] === true) return true;
  if (object.userData.isSelectionHighlight === true) return true;
  if (object.userData.isWireframeOverlay === true) return true;
  if (object.userData.isFaceSelectionHighlight === true) return true;
  return false;
}

/**
 * Returns true for objects that are editor internals, not scene hierarchy content.
 * Used by the outliner and hierarchy tools to hide decorative edges, selection
 * outlines, wireframe overlays, and similar helpers parented under meshes.
 * @param object The object to test.
 * @returns True when the object should be hidden from the content outliner.
 */
export function isEditorHelperObject(object: THREE.Object3D): boolean {
  if (isEditorOverlayChild(object)) return true;
  if (object.userData[DECORATIVE_EDGE_USERDATA_KEY] === true) return true;
  if (object.userData[SOLID_BRUSH_EDGE_USERDATA_KEY] === true) return true;
  if (object.userData.isBoundsGuideLines === true) return true;
  if (object.userData.isGizmoOccludedGhost === true) return true;
  if (object.userData.isBoundsFacePick === true) return true;
  if (object.userData.isClipPlanePreview === true) return true;
  if (object.userData.isSolidModelResult === true) return true;
  return false;
}

/**
 * Disposes geometry and material of a line object.
 * Shared brush edge materials are left alive for reuse.
 * @param object The line object to dispose.
 */
function disposeLineObject(object: THREE.Object3D): void {
  if (!(object instanceof THREE.LineSegments) && !(object instanceof THREE.Line)) {
    return;
  }
  object.geometry?.dispose();
  if (Array.isArray(object.material)) {
    object.material.forEach((material) => disposeOwnedLineMaterial(material));
    return;
  }
  if (object.material) disposeOwnedLineMaterial(object.material);
}

/**
 * Disposes a line material unless it is a shared brush edge material.
 * @param material Material to dispose.
 */
function disposeOwnedLineMaterial(material: THREE.Material): void {
  if (material.userData[BRUSH_EDGE_SHARED_MATERIAL_KEY] === true) return;
  material.dispose();
}
