import * as THREE from 'three';
import { FaceSelection } from './face_selection_manager.js';
import { expandFaceSelectionIndices } from './solid_result_face_indices.js';

/** A distinct coplanar face region on a single mesh, ready for extrusion. */
export interface FaceRegion {
  mesh: THREE.Mesh;
  faceIndices: number[];
}

/**
 * Groups selected face triangles into independent face regions. Solid results
 * keep one region per brush face; ordinary meshes use coplanar units. Each
 * region becomes one convex prism when extruded.
 *
 * @param selections The current face selection entries.
 * @returns Ordered face regions (stable per mesh, then by seed face index).
 */
export function groupSelectionsIntoFaceRegions(selections: FaceSelection[]): FaceRegion[] {
  if (selections.length === 0) return [];
  const byMesh = groupSelectionsByMesh(selections);
  const regions: FaceRegion[] = [];
  byMesh.forEach((faceIndices, mesh) => {
    const meshRegions = splitMeshFacesIntoSelectableRegions(mesh, faceIndices);
    meshRegions.forEach((regionIndices) => {
      regions.push({ mesh, faceIndices: regionIndices });
    });
  });
  return regions;
}

/**
 * Buckets face selections by their owning mesh.
 *
 * @param selections Face selection entries.
 * @returns Map from mesh to selected triangle indices.
 */
function groupSelectionsByMesh(selections: FaceSelection[]): Map<THREE.Mesh, number[]> {
  const byMesh = new Map<THREE.Mesh, number[]>();
  selections.forEach((entry) => {
    const existing = byMesh.get(entry.mesh);
    if (existing) {
      if (!existing.includes(entry.faceIndex)) {
        existing.push(entry.faceIndex);
      }
      return;
    }
    byMesh.set(entry.mesh, [entry.faceIndex]);
  });
  return byMesh;
}

/**
 * Splits selected triangle indices on one mesh into selectable face regions.
 * Uses solid brush-surface identity when present; otherwise connected
 * coplanar.
 *
 * @param mesh The mesh owning the faces.
 * @param faceIndices Selected triangle indices on that mesh.
 * @returns Arrays of triangle indices, one region each.
 */
function splitMeshFacesIntoSelectableRegions(mesh: THREE.Mesh, faceIndices: number[]): number[][] {
  const remaining = new Set(faceIndices);
  const regions: number[][] = [];
  const sortedSeeds = faceIndices.slice().sort((a, b) => a - b);
  sortedSeeds.forEach((seed) => {
    if (!remaining.has(seed)) return;
    const region = expandFaceSelectionIndices(mesh, seed).filter((index) => remaining.has(index));
    const finalRegion = region.length > 0 ? region : [seed];
    finalRegion.forEach((index) => remaining.delete(index));
    regions.push(finalRegion.sort((a, b) => a - b));
  });
  return regions;
}
