import * as THREE from 'three';
import { FaceTextureMapEntry } from './face_texture_mapping.js';
import { getGeometrySource } from './geometry_source.js';
import { computeRegionWorldNormal } from './planar_uv_projector.js';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';

/** Wall-like sides: normals nearly horizontal. */
const SIDE_NORMAL_Y_MAX = 0.35;

const scratchLocal = new THREE.Vector3();
const scratchWorld = new THREE.Vector3();

/**
 * Applies circumferential U offsets to cylinder side faces via UV matrix W
 * terms. Each side keeps face-plane projection; U ranges lay end-to-end around
 * the shell. Caps are left unchanged.
 *
 * @param mesh Mesh whose geometry source may be a cylinder.
 * @param entries Face texture map entries to mutate in place.
 */
export function applyCylinderSideUnwrapOffsets(mesh: THREE.Mesh, entries: FaceTextureMapEntry[]): void {
  if (!isCylinderMesh(mesh)) return;
  mesh.updateMatrixWorld(true);
  const sideEntries = collectSortedSideEntries(mesh, entries);
  if (sideEntries.length < 3) return;
  assignSequentialUMatrixOffsets(mesh, sideEntries);
}

/**
 * Returns whether the mesh is stamped or typed as a cylinder.
 *
 * @param mesh Mesh to inspect.
 * @returns True for cylinder primitives.
 */
function isCylinderMesh(mesh: THREE.Mesh): boolean {
  const source = getGeometrySource(mesh) || getGeometrySource(mesh.geometry);
  if (source?.type === 'cylinder') return true;
  return mesh.geometry instanceof THREE.CylinderGeometry;
}

/**
 * Collects side-face entries sorted by normal angle around Y.
 *
 * @param mesh Mesh providing world normals.
 * @param entries All face map entries.
 * @returns Side entries sorted by XZ normal angle around Y.
 */
function collectSortedSideEntries(mesh: THREE.Mesh, entries: FaceTextureMapEntry[]): FaceTextureMapEntry[] {
  const sides = entries.filter((entry) => {
    const normal = computeRegionWorldNormal(mesh, entry.triangleIndices);
    return Math.abs(normal.y) <= SIDE_NORMAL_Y_MAX;
  });
  sides.sort((a, b) => {
    const na = computeRegionWorldNormal(mesh, a.triangleIndices);
    const nb = computeRegionWorldNormal(mesh, b.triangleIndices);
    return Math.atan2(na.x, na.z) - Math.atan2(nb.x, nb.z);
  });
  return sides;
}

/**
 * Writes sequential U translations so side U ranges tile around the cylinder.
 *
 * @param mesh Mesh for vertex transforms.
 * @param sideEntries Side faces in angular order.
 */
function assignSequentialUMatrixOffsets(mesh: THREE.Mesh, sideEntries: FaceTextureMapEntry[]): void {
  let cumulativeU = 0;
  sideEntries.forEach((entry) => {
    const dots = collectFaceUDots(mesh, entry);
    if (dots.length === 0) return;
    const minDot = Math.min(...dots);
    const maxDot = Math.max(...dots);
    const uvSpan = maxDot - minDot;
    const u = entry.mapping.uv.u;
    const v = entry.mapping.uv.v;
    entry.mapping.uv = new SurfaceUvMatrix(
      new THREE.Vector4(u.x, u.y, u.z, cumulativeU - minDot),
      new THREE.Vector4(v.x, v.y, v.z, v.w),
    );
    cumulativeU += uvSpan;
  });
}

/**
 * Collects raw U = U.xyz · worldPos for every vertex in a face region.
 *
 * @param mesh Mesh owner.
 * @param entry Face region and mapping.
 * @returns Dot products along the matrix U direction (without W).
 */
function collectFaceUDots(mesh: THREE.Mesh, entry: FaceTextureMapEntry): number[] {
  const u = entry.mapping.uv.u;
  const uDir = new THREE.Vector3(u.x, u.y, u.z);
  const position = mesh.geometry.getAttribute('position');
  const index = mesh.geometry.getIndex();
  const dots: number[] = [];
  entry.triangleIndices.forEach((faceIndex) => {
    for (let corner = 0; corner < 3; corner++) {
      const vertexIndex = index ? index.getX(faceIndex * 3 + corner) : faceIndex * 3 + corner;
      scratchLocal.fromBufferAttribute(position, vertexIndex);
      scratchWorld.copy(scratchLocal).applyMatrix4(mesh.matrixWorld);
      dots.push(uDir.dot(scratchWorld));
    }
  });
  return dots;
}
