import * as THREE from 'three';
import type { MeshDocument } from '@/mesh/document/mesh_document.js';
import { meshTopologyFaceHalfEdgeIndices } from '@/mesh/topology/mesh_topology_query.js';

/**
 * Builds a display BufferGeometry from a mesh document. Corners are expanded so
 * face-corner UVs do not fight shared topology vertices (GPU split).
 *
 * @param document Source mesh document.
 * @returns New buffer geometry with position, index, and uv attributes.
 */
export function meshDocumentToBufferGeometry(document: MeshDocument): THREE.BufferGeometry {
  const expanded = expandDocumentCorners(document);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(expanded.positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(expanded.uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(expanded.indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

/** Expanded GPU buffers for one document. */
interface ExpandedCornerBuffers {
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

/**
 * Expands each face corner into a unique GPU vertex.
 *
 * @param document Source document.
 * @returns Expanded position, uv, and index buffers.
 */
function expandDocumentCorners(document: MeshDocument): ExpandedCornerBuffers {
  const topology = document.getTopology();
  const cornerUvs = document.getAttributes().getCornerUvs();
  const faceCount = topology.getFaceCount();
  const cornerCount = countTotalCorners(document);
  const positions = new Float32Array(cornerCount * 3);
  const uvs = new Float32Array(cornerCount * 2);
  const indices = new Uint32Array(countTriangleIndices(document));
  let cornerWrite = 0;
  let indexWrite = 0;
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    const result = writeFaceCorners(
      document,
      faceIndex,
      positions,
      uvs,
      indices,
      cornerWrite,
      indexWrite,
      cornerUvs.getValues(),
    );
    cornerWrite = result.cornerWrite;
    indexWrite = result.indexWrite;
  }
  return { positions, uvs, indices };
}

/**
 * Counts all face corners in a document.
 *
 * @param document Mesh document.
 * @returns Corner count.
 */
function countTotalCorners(document: MeshDocument): number {
  return document.getTopology().getHalfEdgeCount();
}

/**
 * Counts triangle indices emitted for all faces (fan triangulation).
 *
 * @param document Mesh document.
 * @returns Index count.
 */
function countTriangleIndices(document: MeshDocument): number {
  const topology = document.getTopology();
  let indexCount = 0;
  const faceCount = topology.getFaceCount();
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    const cornerCount = meshTopologyFaceHalfEdgeIndices(topology, faceIndex).length;
    if (cornerCount >= 3) {
      indexCount += (cornerCount - 2) * 3;
    }
  }
  return indexCount;
}

/**
 * Writes one face's expanded corners and fan indices.
 *
 * @param document Mesh document.
 * @param faceIndex Face index.
 * @param positions Output positions.
 * @param uvs Output uvs.
 * @param indices Output indices.
 * @param cornerWrite Next free corner slot.
 * @param indexWrite Next free index slot.
 * @param cornerUvValues Packed corner UV buffer.
 * @returns Updated write cursors.
 */
function writeFaceCorners(
  document: MeshDocument,
  faceIndex: number,
  positions: Float32Array,
  uvs: Float32Array,
  indices: Uint32Array,
  cornerWrite: number,
  indexWrite: number,
  cornerUvValues: Float32Array,
): { cornerWrite: number; indexWrite: number } {
  const topology = document.getTopology();
  const halfEdgeIndices = meshTopologyFaceHalfEdgeIndices(topology, faceIndex);
  const faceCornerStart = cornerWrite;
  for (const halfEdgeIndex of halfEdgeIndices) {
    writeOneCorner(document, halfEdgeIndex, positions, uvs, cornerWrite, cornerUvValues);
    cornerWrite += 1;
  }
  indexWrite = writeFaceFanIndices(indices, indexWrite, faceCornerStart, halfEdgeIndices.length);
  return { cornerWrite, indexWrite };
}

/**
 * Writes one expanded corner position and UV.
 *
 * @param document Mesh document.
 * @param halfEdgeIndex Half-edge / corner index.
 * @param positions Output positions.
 * @param uvs Output uvs.
 * @param cornerSlot Expanded corner index.
 * @param cornerUvValues Packed corner UV buffer.
 */
function writeOneCorner(
  document: MeshDocument,
  halfEdgeIndex: number,
  positions: Float32Array,
  uvs: Float32Array,
  cornerSlot: number,
  cornerUvValues: Float32Array,
): void {
  const topology = document.getTopology();
  const vertexIndex = topology.getHalfEdge(halfEdgeIndex).vertexIndex;
  const source = topology.getPositions();
  const positionBase = vertexIndex * 3;
  const destBase = cornerSlot * 3;
  positions[destBase] = source[positionBase]!;
  positions[destBase + 1] = source[positionBase + 1]!;
  positions[destBase + 2] = source[positionBase + 2]!;
  const uvBase = halfEdgeIndex * 2;
  const uvDest = cornerSlot * 2;
  uvs[uvDest] = cornerUvValues[uvBase] ?? 0;
  uvs[uvDest + 1] = cornerUvValues[uvBase + 1] ?? 0;
}

/**
 * Writes fan triangulation indices for an expanded face.
 *
 * @param indices Output index buffer.
 * @param indexWrite Next free index slot.
 * @param faceCornerStart First expanded corner of the face.
 * @param cornerCount Face corner count.
 * @returns Updated index write cursor.
 */
function writeFaceFanIndices(
  indices: Uint32Array,
  indexWrite: number,
  faceCornerStart: number,
  cornerCount: number,
): number {
  for (let fan = 1; fan < cornerCount - 1; fan++) {
    indices[indexWrite] = faceCornerStart;
    indices[indexWrite + 1] = faceCornerStart + fan;
    indices[indexWrite + 2] = faceCornerStart + fan + 1;
    indexWrite += 3;
  }
  return indexWrite;
}
