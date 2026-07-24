import * as THREE from 'three';
import { SolidBrushEdgeMaterials } from './solid_brush_edge_materials.js';
import { DECORATIVE_EDGE_USERDATA_KEY } from '../../utils/mesh_edge_sync.js';

/**
 * Disposes geometry and materials for a removed brush mesh. Shared brush edge
 * materials are retained for reuse.
 *
 * @param mesh Brush preview mesh.
 */
export function disposeBrushPreviewResources(mesh: THREE.Mesh): void {
  mesh.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
      child.geometry?.dispose();
      disposeOwnedMaterials(child.material);
    }
  });
}

/**
 * Disposes mesh-owned materials while leaving shared edge materials alive.
 *
 * @param material Material or material array on a disposed mesh child.
 */
export function disposeOwnedMaterials(material: THREE.Material | THREE.Material[] | undefined): void {
  if (Array.isArray(material)) {
    material.forEach((entry) => disposeOwnedMaterial(entry));
    return;
  }
  if (material) disposeOwnedMaterial(material);
}

/**
 * Disposes one material unless it is a shared brush edge material.
 *
 * @param material Material to dispose.
 */
export function disposeOwnedMaterial(material: THREE.Material): void {
  if (SolidBrushEdgeMaterials.isSharedMaterial(material)) return;
  material.dispose();
}

/**
 * Removes decorative edge children from a mesh.
 *
 * @param mesh Mesh to clean.
 */
export function stripStaleDecorativeEdges(mesh: THREE.Mesh): void {
  const stale = mesh.children.filter((child) => child.userData[DECORATIVE_EDGE_USERDATA_KEY] === true);
  for (const child of stale) {
    mesh.remove(child);
    disposeDecorativeEdgeChild(child);
  }
}

/**
 * Disposes GPU resources for one decorative edge child if applicable.
 *
 * @param child Scene child previously marked as decorative edge.
 */
function disposeDecorativeEdgeChild(child: THREE.Object3D): void {
  if (!(child instanceof THREE.LineSegments)) return;
  child.geometry.dispose();
  if (child.material instanceof THREE.Material) child.material.dispose();
}
