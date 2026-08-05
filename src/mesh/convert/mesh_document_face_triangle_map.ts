import type { MeshDocument } from '@/mesh/document/mesh_document.js';
import { meshTopologyFaceHalfEdgeIndices } from '@/mesh/topology/mesh_topology_query.js';

/**
 * Maps a display BufferGeometry triangle index (after
 * {@link meshDocumentToBufferGeometry} ear-clip expansion) back to the source
 * MeshDocument face index.
 *
 * @param document Source mesh document.
 * @param displayTriangleIndex Triangle index from raycast faceIndex.
 * @returns Document face index, or null when out of range.
 */
export function meshDocumentFaceIndexFromDisplayTriangle(
  document: MeshDocument,
  displayTriangleIndex: number,
): number | null {
  if (!Number.isFinite(displayTriangleIndex) || displayTriangleIndex < 0) {
    return null;
  }
  let remaining = Math.floor(displayTriangleIndex);
  const topology = document.getTopology();
  const faceCount = topology.getFaceCount();
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    const cornerCount = meshTopologyFaceHalfEdgeIndices(topology, faceIndex).length;
    const triangleCount = Math.max(0, cornerCount - 2);
    if (remaining < triangleCount) {
      return faceIndex;
    }
    remaining -= triangleCount;
  }
  return null;
}
