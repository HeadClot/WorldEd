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
