import { meshDocumentFromPolygonList } from './mesh_from_polygon_list.js';
import type { MeshDocument } from '@/mesh/document/mesh_document.js';

/**
 * Builds a mesh document from packed positions and a flat triangle index list.
 * Topology vertices match the position buffer 1:1 (no welding).
 *
 * @param positions Packed xyz vertex positions.
 * @param triangleIndices Flat triangle indices.
 * @param cornerUvs Optional interleaved corner u,v matching half-edge order
 *   (three corners per triangle in the same order as indices).
 * @returns New mesh document.
 */
export function meshDocumentFromTriangleList(
  positions: Float32Array,
  triangleIndices: ArrayLike<number>,
  cornerUvs?: Float32Array,
): MeshDocument {
  const faces: number[][] = [];
  const triangleCount = Math.floor(triangleIndices.length / 3);
  for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex++) {
    const base = triangleIndex * 3;
    faces.push([triangleIndices[base]!, triangleIndices[base + 1]!, triangleIndices[base + 2]!]);
  }
  return meshDocumentFromPolygonList(positions, faces, cornerUvs);
}
