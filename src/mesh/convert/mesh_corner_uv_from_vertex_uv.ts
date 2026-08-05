import * as THREE from 'three';

/**
 * Expands per-vertex UVs into a per-triangle-corner UV buffer using triangle
 * indices.
 *
 * @param indices Flat triangle vertex indices.
 * @param vertexUvs Interleaved per-vertex u,v floats.
 * @returns Interleaved corner u,v floats (two components per index entry).
 */
export function meshCornerUvsFromVertexUvs(indices: ArrayLike<number>, vertexUvs: ArrayLike<number>): Float32Array {
  const cornerUvs = new Float32Array(indices.length * 2);
  for (let corner = 0; corner < indices.length; corner++) {
    const vertexIndex = indices[corner]!;
    cornerUvs[corner * 2] = vertexUvs[vertexIndex * 2]!;
    cornerUvs[corner * 2 + 1] = vertexUvs[vertexIndex * 2 + 1]!;
  }
  return cornerUvs;
}

/**
 * Reads per-triangle-corner UVs from a BufferGeometry UV attribute in the same
 * order as the supplied triangle index list.
 *
 * @param geometry Source buffer geometry.
 * @param triangleIndices Flat triangle vertex indices.
 * @returns Interleaved corner u,v, or undefined when the UV attribute is
 *   missing.
 */
export function meshCornerUvsFromBufferGeometry(
  geometry: THREE.BufferGeometry,
  triangleIndices: ArrayLike<number>,
): Float32Array | undefined {
  const uv = geometry.getAttribute('uv');
  if (!uv) {
    return undefined;
  }
  return meshCornerUvsFromUvAttribute(uv, triangleIndices);
}

/**
 * Reads per-triangle-corner UVs from a UV buffer attribute.
 *
 * @param uv Geometry UV attribute.
 * @param triangleIndices Flat triangle vertex indices.
 * @returns Interleaved corner u,v.
 */
function meshCornerUvsFromUvAttribute(
  uv: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  triangleIndices: ArrayLike<number>,
): Float32Array {
  const cornerCount = triangleIndices.length;
  const cornerUvs = new Float32Array(cornerCount * 2);
  for (let corner = 0; corner < cornerCount; corner++) {
    const vertexIndex = triangleIndices[corner]!;
    cornerUvs[corner * 2] = uv.getX(vertexIndex);
    cornerUvs[corner * 2 + 1] = uv.getY(vertexIndex);
  }
  return cornerUvs;
}
