import { MeshAttributeStore } from '@/mesh/attribute/mesh_attribute_store.js';
import { MeshDocument } from '@/mesh/document/mesh_document.js';
import { meshTopologyFromTriangleBuffers } from '@/mesh/topology/mesh_topology_builder.js';

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
  const topology = meshTopologyFromTriangleBuffers(positions, triangleIndices);
  const attributes = new MeshAttributeStore(topology.getHalfEdgeCount(), topology.getFaceCount());
  if (cornerUvs) {
    writeCornerUvsFromTriangleOrder(attributes, topology.getHalfEdgeCount(), cornerUvs);
  }
  return new MeshDocument(topology, attributes);
}

/**
 * Copies triangle-order corner UVs into the attribute store.
 *
 * @param attributes Attribute store.
 * @param halfEdgeCount Expected half-edge count.
 * @param cornerUvs Interleaved u,v for each triangle corner.
 */
function writeCornerUvsFromTriangleOrder(
  attributes: MeshAttributeStore,
  halfEdgeCount: number,
  cornerUvs: Float32Array,
): void {
  const store = attributes.getCornerUvs();
  store.ensureCornerCount(halfEdgeCount);
  const copyCount = Math.min(halfEdgeCount * 2, cornerUvs.length);
  store.getValues().set(cornerUvs.subarray(0, copyCount));
}
