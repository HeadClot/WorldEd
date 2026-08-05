import * as THREE from 'three';
import { MeshDocument } from '@/mesh/document/mesh_document.js';
import { MeshTopologyBuilder } from '@/mesh/topology/mesh_topology_builder.js';
import {
  meshTopologyFaceHalfEdgeIndices,
  meshTopologyHalfEdgeCornerVertex,
} from '@/mesh/topology/mesh_topology_query.js';
import { meshVertexPositionRead } from '@/mesh/topology/mesh_vertex_position.js';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';

/**
 * Builds a centered box mesh document with shared corner vertices (closed).
 * Each side is a single quad face (n-gon), not two triangles. Corner UVs use a
 * centered planar projection (translation +0.5) matching solid brush defaults.
 *
 * @param width Extent on X.
 * @param height Extent on Y.
 * @param depth Extent on Z.
 * @returns Mesh document with six quad faces.
 */
export function createMeshDocumentBox(width: number = 1, height: number = 1, depth: number = 1): MeshDocument {
  const builder = new MeshTopologyBuilder();
  const halfWidth = width * 0.5;
  const halfHeight = height * 0.5;
  const halfDepth = depth * 0.5;
  const vertices = appendBoxCorners(builder, halfWidth, halfHeight, halfDepth);
  appendBoxFaces(builder, vertices);
  const document = new MeshDocument(builder.build());
  bakeCenteredPlanarCornerUvs(document);
  return document;
}

/**
 * Writes centered planar UVs onto every face corner (brush-style +0.5 offset).
 *
 * @param document Box mesh document.
 */
function bakeCenteredPlanarCornerUvs(document: MeshDocument): void {
  const topology = document.getTopology();
  const positions = topology.getPositions();
  const cornerUvs = document.getAttributes().getCornerUvs().getValues();
  const scratch = { 0: 0, 1: 0, 2: 0, length: 3 } as {
    0: number;
    1: number;
    2: number;
    length: number;
  };
  const point = new THREE.Vector3();
  const faceCount = topology.getFaceCount();
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    const halfEdges = meshTopologyFaceHalfEdgeIndices(topology, faceIndex);
    const normal = computeFaceNormal(positions, topology, faceIndex, scratch, point);
    const uvMatrix = SurfaceUvMatrix.fromTrs(new THREE.Vector2(0.5, 0.5), normal, 0, 1, 1);
    for (const halfEdgeIndex of halfEdges) {
      const vertexIndex = meshTopologyHalfEdgeCornerVertex(topology, halfEdgeIndex);
      meshVertexPositionRead(positions, vertexIndex, scratch);
      point.set(scratch[0], scratch[1], scratch[2]);
      const uv = uvMatrix.project(point);
      const base = halfEdgeIndex * 2;
      cornerUvs[base] = uv.u;
      cornerUvs[base + 1] = uv.v;
    }
  }
  document.markAttributesDirty();
}

/**
 * Computes a unit face normal from the first three corners of a face.
 *
 * @param positions Packed vertex positions.
 * @param topology Mesh topology.
 * @param faceIndex Face index.
 * @param scratch Read buffer for vertex positions.
 * @param point Scratch vector.
 * @returns Unit face normal.
 */
function computeFaceNormal(
  positions: Float32Array,
  topology: import('@/mesh/topology/mesh_topology.js').MeshTopology,
  faceIndex: number,
  scratch: { 0: number; 1: number; 2: number; length: number },
  point: THREE.Vector3,
): THREE.Vector3 {
  const halfEdges = meshTopologyFaceHalfEdgeIndices(topology, faceIndex);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  readVertex(positions, topology, halfEdges[0]!, scratch, a);
  readVertex(positions, topology, halfEdges[1]!, scratch, b);
  readVertex(positions, topology, halfEdges[2]!, scratch, c);
  void point;
  return new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
}

/**
 * Reads a corner vertex position into an output vector.
 *
 * @param positions Packed positions.
 * @param topology Topology.
 * @param halfEdgeIndex Half-edge index.
 * @param scratch Read buffer.
 * @param out Output vector.
 */
function readVertex(
  positions: Float32Array,
  topology: import('@/mesh/topology/mesh_topology.js').MeshTopology,
  halfEdgeIndex: number,
  scratch: { 0: number; 1: number; 2: number; length: number },
  out: THREE.Vector3,
): void {
  const vertexIndex = meshTopologyHalfEdgeCornerVertex(topology, halfEdgeIndex);
  meshVertexPositionRead(positions, vertexIndex, scratch);
  out.set(scratch[0], scratch[1], scratch[2]);
}

/**
 * Appends the eight corners of a centered box.
 *
 * @param builder Topology builder.
 * @param halfWidth Half extent X.
 * @param halfHeight Half extent Y.
 * @param halfDepth Half extent Z.
 * @returns Eight corner vertex indices.
 */
function appendBoxCorners(
  builder: MeshTopologyBuilder,
  halfWidth: number,
  halfHeight: number,
  halfDepth: number,
): number[] {
  return [
    builder.appendVertex(-halfWidth, -halfHeight, -halfDepth),
    builder.appendVertex(halfWidth, -halfHeight, -halfDepth),
    builder.appendVertex(halfWidth, halfHeight, -halfDepth),
    builder.appendVertex(-halfWidth, halfHeight, -halfDepth),
    builder.appendVertex(-halfWidth, -halfHeight, halfDepth),
    builder.appendVertex(halfWidth, -halfHeight, halfDepth),
    builder.appendVertex(halfWidth, halfHeight, halfDepth),
    builder.appendVertex(-halfWidth, halfHeight, halfDepth),
  ];
}

/**
 * Appends six quad faces for a box with outward winding (CCW from outside).
 *
 * @param builder Topology builder.
 * @param vertices Eight corner indices.
 */
function appendBoxFaces(builder: MeshTopologyBuilder, vertices: number[]): void {
  const [v0, v1, v2, v3, v4, v5, v6, v7] = vertices;
  builder.appendFace([v0!, v3!, v2!, v1!]);
  builder.appendFace([v4!, v5!, v6!, v7!]);
  builder.appendFace([v0!, v1!, v5!, v4!]);
  builder.appendFace([v3!, v7!, v6!, v2!]);
  builder.appendFace([v0!, v4!, v7!, v3!]);
  builder.appendFace([v1!, v2!, v6!, v5!]);
}
