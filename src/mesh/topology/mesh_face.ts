/**
 * Polygonal face stored as a loop of half-edges. Corner count is obtained by
 * walking nextIndex from halfEdgeIndex until the walk returns.
 */
export interface MeshFace {
  /** Index of one half-edge belonging to this face. */
  halfEdgeIndex: number;
}

/**
 * Creates a face that starts at the given half-edge.
 *
 * @param halfEdgeIndex Seed half-edge on the face loop.
 * @returns New face value.
 */
export function createMeshFace(halfEdgeIndex: number): MeshFace {
  return { halfEdgeIndex };
}

/**
 * Clones a face value.
 *
 * @param face Source face.
 * @returns Independent copy.
 */
export function cloneMeshFace(face: MeshFace): MeshFace {
  return createMeshFace(face.halfEdgeIndex);
}
