import { MeshDocument } from '@/mesh/document/mesh_document.js';
import { meshCornerUvsFromVertexUvs } from '@/mesh/convert/mesh_corner_uv_from_vertex_uv.js';
import { meshDocumentFromTriangleList } from '@/mesh/convert/mesh_from_triangle_list.js';

/**
 * Builds a UV-sphere mesh document with corner UVs from spherical mapping. Does
 * not create per-triangle planar surface proxies.
 *
 * @param radius Sphere radius.
 * @param widthSegments Longitude segments (minimum 3).
 * @param heightSegments Latitude segments (minimum 2).
 * @returns Mesh document for a closed sphere shell.
 */
export function createMeshDocumentSphere(
  radius: number = 0.5,
  widthSegments: number = 32,
  heightSegments: number = 16,
): MeshDocument {
  const segmentsX = Math.max(3, Math.floor(widthSegments));
  const segmentsY = Math.max(2, Math.floor(heightSegments));
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  appendSphereVertices(positions, uvs, radius, segmentsX, segmentsY);
  appendSphereIndices(indices, segmentsX, segmentsY);
  const cornerUvs = meshCornerUvsFromVertexUvs(indices, uvs);
  return meshDocumentFromTriangleList(Float32Array.from(positions), indices, cornerUvs);
}

/**
 * Appends sphere grid vertices and per-vertex UVs.
 *
 * @param positions Position accumulator.
 * @param uvs UV accumulator.
 * @param radius Sphere radius.
 * @param segmentsX Longitude segments.
 * @param segmentsY Latitude segments.
 */
function appendSphereVertices(
  positions: number[],
  uvs: number[],
  radius: number,
  segmentsX: number,
  segmentsY: number,
): void {
  for (let y = 0; y <= segmentsY; y++) {
    const v = y / segmentsY;
    const polar = v * Math.PI;
    for (let x = 0; x <= segmentsX; x++) {
      const u = x / segmentsX;
      const azimuth = u * Math.PI * 2;
      appendSphereVertex(positions, uvs, radius, polar, azimuth, u, v);
    }
  }
}

/**
 * Appends one sphere vertex from spherical coordinates.
 *
 * @param positions Position accumulator.
 * @param uvs UV accumulator.
 * @param radius Sphere radius.
 * @param polar Polar angle.
 * @param azimuth Azimuth angle.
 * @param u Texture U.
 * @param v Texture V.
 */
function appendSphereVertex(
  positions: number[],
  uvs: number[],
  radius: number,
  polar: number,
  azimuth: number,
  u: number,
  v: number,
): void {
  const sinPolar = Math.sin(polar);
  positions.push(
    radius * sinPolar * Math.cos(azimuth),
    radius * Math.cos(polar),
    radius * sinPolar * Math.sin(azimuth),
  );
  uvs.push(u, 1 - v);
}

/**
 * Appends triangle indices for the sphere grid.
 *
 * @param indices Index accumulator.
 * @param segmentsX Longitude segments.
 * @param segmentsY Latitude segments.
 */
function appendSphereIndices(indices: number[], segmentsX: number, segmentsY: number): void {
  const stride = segmentsX + 1;
  for (let y = 0; y < segmentsY; y++) {
    for (let x = 0; x < segmentsX; x++) {
      const a = y * stride + x;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      if (y !== 0) {
        indices.push(a, b, d);
      }
      if (y !== segmentsY - 1) {
        indices.push(a, d, c);
      }
    }
  }
}
