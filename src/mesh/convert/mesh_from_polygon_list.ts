import { MeshAttributeStore } from '@/mesh/attribute/mesh_attribute_store.js';
import { MeshDocument } from '@/mesh/document/mesh_document.js';
import { meshTopologyFromPolygonFaces } from '@/mesh/topology/mesh_topology_builder.js';

/**
 * Builds a mesh document from packed positions and polygonal face loops.
 * Topology vertices match the position buffer 1:1 (no welding). Faces may be
 * triangles, quads, or higher n-gons.
 *
 * @param positions Packed xyz vertex positions.
 * @param faces Ordered vertex-index loops (each length ≥ 3).
 * @param cornerUvs Optional interleaved corner u,v matching half-edge order
 *   (one uv pair per face corner, faces in the same order as {@code faces}).
 * @returns New mesh document.
 */
export function meshDocumentFromPolygonList(
  positions: Float32Array,
  faces: readonly (readonly number[])[],
  cornerUvs?: Float32Array,
): MeshDocument {
  const topology = meshTopologyFromPolygonFaces(positions, faces);
  const attributes = new MeshAttributeStore(topology.getHalfEdgeCount(), topology.getFaceCount());
  if (cornerUvs) {
    writeCornerUvsFromFaceOrder(attributes, topology.getHalfEdgeCount(), cornerUvs);
  }
  return new MeshDocument(topology, attributes);
}

/**
 * Copies face-order corner UVs into the attribute store.
 *
 * @param attributes Attribute store.
 * @param halfEdgeCount Expected half-edge count.
 * @param cornerUvs Interleaved u,v for each face corner in half-edge order.
 */
function writeCornerUvsFromFaceOrder(
  attributes: MeshAttributeStore,
  halfEdgeCount: number,
  cornerUvs: Float32Array,
): void {
  const store = attributes.getCornerUvs();
  store.ensureCornerCount(halfEdgeCount);
  const copyCount = Math.min(halfEdgeCount * 2, cornerUvs.length);
  store.getValues().set(cornerUvs.subarray(0, copyCount));
}
