import * as THREE from 'three';
import { FaceSelection } from './manager_face_selection.js';
import { expandFaceSelectionIndices } from './solid_result_face_indices.js';
import { buildFacePickRegionKey } from './solid_triangle_source_index.js';

/** A distinct coplanar face region on a single mesh, ready for extrusion. */
export interface FaceRegion {
  mesh: THREE.Mesh;
  faceIndices: number[];
}

/**
 * Groups selected face entries into independent face regions. Solid results
 * keep one region per brush face (selection may only store a seed triangle);
 * ordinary meshes use coplanar units. Each region becomes one convex prism when
 * extruded.
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
 * Expands solid seeds to every triangle on that brush face.
 *
 * @param mesh The mesh owning the faces.
 * @param faceIndices Selected triangle seeds on that mesh.
 * @returns Arrays of triangle indices, one region each.
 */
function splitMeshFacesIntoSelectableRegions(mesh: THREE.Mesh, faceIndices: number[]): number[][] {
  const remaining = new Set(faceIndices);
  const regions: number[][] = [];
  const sortedSeeds = faceIndices.slice().sort((a, b) => a - b);
  for (const seed of sortedSeeds) {
    if (!remaining.has(seed)) continue;
    const region = expandFaceSelectionIndices(mesh, seed);
    const finalRegion = region.length > 0 ? region : [seed];
    const regionSet = new Set(finalRegion);
    const regionKey = buildFacePickRegionKey(mesh, seed);
    for (const selected of faceIndices) {
      if (!remaining.has(selected)) continue;
      if (regionSet.has(selected) || buildFacePickRegionKey(mesh, selected) === regionKey) {
        remaining.delete(selected);
      }
    }
    regions.push(finalRegion.slice().sort((a, b) => a - b));
  }
  return regions;
}
