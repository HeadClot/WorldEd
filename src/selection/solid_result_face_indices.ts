import * as THREE from 'three';
import { SOLID_TRIANGLE_SOURCES_USERDATA_KEY } from '../solid/model/solid_model.js';
import { findConnectedCoplanarFaceIndices } from './triangle_geometry_utils.js';

/** Per-triangle solid CSG source identity stored on result meshes. */
export interface SolidTriangleSourceRef {
  brushId: string;
  surfaceIndex: number;
}

/**
 * Expands a face pick to one selectable face unit. Solid CSG results stay
 * within one authored brush face (brushId + surfaceIndex) so adjacent walls and
 * carpet/detail brushes remain independently selectable. Ordinary meshes expand
 * to edge-connected coplanar triangles.
 *
 * @param mesh Hit mesh (solid result or ordinary geometry).
 * @param seedFaceIndex Clicked triangle index.
 * @returns Triangle indices that form the selectable face unit.
 */
export function expandFaceSelectionIndices(mesh: THREE.Mesh, seedFaceIndex: number): number[] {
  const sources = readSolidTriangleSources(mesh);
  if (sources) {
    return collectSameSolidBrushSurfaceIndices(sources, seedFaceIndex);
  }
  return findConnectedCoplanarFaceIndices(mesh.geometry, seedFaceIndex);
}

/**
 * Returns all result triangles that share the seed's brush id and surface
 * index. When the mesh has solid sources but the seed row is invalid, returns
 * only the seed (never coplanar flood-fill across unrelated brushes).
 *
 * @param mesh Candidate solid result mesh.
 * @param seedFaceIndex Seed triangle.
 * @returns Sorted triangle indices, or null when the mesh is not a solid
 *   result.
 */
export function findSameSolidBrushSurfaceIndices(mesh: THREE.Mesh, seedFaceIndex: number): number[] | null {
  const sources = readSolidTriangleSources(mesh);
  if (!sources) return null;
  return collectSameSolidBrushSurfaceIndices(sources, seedFaceIndex);
}

/**
 * Collects triangle indices matching the seed brush face within a source table.
 *
 * @param sources Per-triangle solid source rows (same order as result
 *   triangles).
 * @param seedFaceIndex Seed triangle index.
 * @returns Sorted matching triangle indices (at least the seed).
 */
function collectSameSolidBrushSurfaceIndices(sources: SolidTriangleSourceRef[], seedFaceIndex: number): number[] {
  const seed = sources[seedFaceIndex];
  if (!seed?.brushId || typeof seed.surfaceIndex !== 'number') {
    return [seedFaceIndex];
  }
  const indices: number[] = [];
  for (let index = 0; index < sources.length; index++) {
    const source = sources[index];
    if (!source) continue;
    if (source.brushId !== seed.brushId) continue;
    if (source.surfaceIndex !== seed.surfaceIndex) continue;
    indices.push(index);
  }
  return indices.length > 0 ? indices : [seedFaceIndex];
}

/**
 * Reads solid triangle sources from mesh userData when present.
 *
 * @param mesh Mesh that may be a solid CSG result.
 * @returns Source array, or null when missing/invalid.
 */
function readSolidTriangleSources(mesh: THREE.Mesh): SolidTriangleSourceRef[] | null {
  const raw = mesh.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY];
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return raw as SolidTriangleSourceRef[];
}
