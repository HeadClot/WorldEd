import * as THREE from 'three';
import { MeshDocument } from '@/mesh/document/mesh_document.js';
import { meshCornerUvsFromBufferGeometry } from './mesh_corner_uv_from_vertex_uv.js';
import { meshDocumentFromTriangleList } from './mesh_from_triangle_list.js';

/**
 * Builds a mesh document from a BufferGeometry. Topology vertices match buffer
 * vertices 1:1 (no welding) so import UVs stay faithful.
 *
 * @param geometry Source buffer geometry.
 * @returns New mesh document.
 */
export function meshDocumentFromBufferGeometry(geometry: THREE.BufferGeometry): MeshDocument {
  const positions = readPositionBuffer(geometry);
  const triangleIndices = readTriangleIndices(geometry);
  const cornerUvs = meshCornerUvsFromBufferGeometry(geometry, triangleIndices);
  return meshDocumentFromTriangleList(positions, triangleIndices, cornerUvs);
}

/**
 * Reads packed xyz positions from geometry.
 *
 * @param geometry Source geometry.
 * @returns Packed positions (empty when missing).
 */
function readPositionBuffer(geometry: THREE.BufferGeometry): Float32Array {
  const position = geometry.getAttribute('position');
  if (!position) {
    return new Float32Array(0);
  }
  const packed = new Float32Array(position.count * 3);
  for (let vertexIndex = 0; vertexIndex < position.count; vertexIndex++) {
    packed[vertexIndex * 3] = position.getX(vertexIndex);
    packed[vertexIndex * 3 + 1] = position.getY(vertexIndex);
    packed[vertexIndex * 3 + 2] = position.getZ(vertexIndex);
  }
  return packed;
}

/**
 * Reads triangle indices as a flat number array.
 *
 * @param geometry Source geometry.
 * @returns Flat triangle indices.
 */
function readTriangleIndices(geometry: THREE.BufferGeometry): number[] {
  const position = geometry.getAttribute('position');
  if (!position) {
    return [];
  }
  const index = geometry.getIndex();
  if (index) {
    return readIndexedTriangleIndices(index);
  }
  return readNonIndexedTriangleIndices(position.count);
}

/**
 * Reads indices from an index buffer.
 *
 * @param index Geometry index attribute.
 * @returns Flat index list.
 */
function readIndexedTriangleIndices(index: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): number[] {
  const values: number[] = [];
  for (let i = 0; i < index.count; i++) {
    values.push(index.getX(i));
  }
  return values;
}

/**
 * Builds sequential triangle indices for non-indexed geometry.
 *
 * @param vertexCount Position vertex count.
 * @returns Flat index list.
 */
function readNonIndexedTriangleIndices(vertexCount: number): number[] {
  const values: number[] = [];
  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex++) {
    values.push(vertexIndex);
  }
  return values;
}
