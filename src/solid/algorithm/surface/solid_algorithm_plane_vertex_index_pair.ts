/**
 * Plane index + hashed vertex index pair used while building intersection loops
 * .
 */
export interface SolidAlgorithmPlaneVertexIndexPair {
  /** Face / base plane index. */
  planeIndex: number;
  /** Hashed tree-space vertex index. */
  vertexIndex: number;
}

/**
 * Appends a plane/vertex pair when not already present.
 *
 * @param found Accumulator list.
 * @param planeIndex Plane index.
 * @param vertexIndex Vertex index.
 */
export function solidAlgorithmPlaneVertexIndexPairPushUnique(
  found: SolidAlgorithmPlaneVertexIndexPair[],
  planeIndex: number,
  vertexIndex: number,
): void {
  for (const existing of found) {
    if (existing.planeIndex === planeIndex && existing.vertexIndex === vertexIndex) {
      return;
    }
  }
  found.push({ planeIndex, vertexIndex });
}
