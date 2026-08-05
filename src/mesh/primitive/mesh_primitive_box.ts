import { MeshDocument } from '@/mesh/document/mesh_document.js';
import { MeshTopologyBuilder } from '@/mesh/topology/mesh_topology_builder.js';

/**
 * Builds a centered box mesh document with shared corner vertices (closed).
 *
 * @param width Extent on X.
 * @param height Extent on Y.
 * @param depth Extent on Z.
 * @returns Mesh document with twelve triangular faces.
 */
export function createMeshDocumentBox(width: number = 1, height: number = 1, depth: number = 1): MeshDocument {
  const builder = new MeshTopologyBuilder();
  const halfWidth = width * 0.5;
  const halfHeight = height * 0.5;
  const halfDepth = depth * 0.5;
  const vertices = appendBoxCorners(builder, halfWidth, halfHeight, halfDepth);
  appendBoxFaces(builder, vertices);
  return new MeshDocument(builder.build());
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
 * Appends twelve triangles for the six box faces.
 *
 * @param builder Topology builder.
 * @param vertices Eight corner indices.
 */
function appendBoxFaces(builder: MeshTopologyBuilder, vertices: number[]): void {
  const [v0, v1, v2, v3, v4, v5, v6, v7] = vertices;
  appendQuad(builder, v0!, v1!, v2!, v3!);
  appendQuad(builder, v4!, v7!, v6!, v5!);
  appendQuad(builder, v0!, v4!, v5!, v1!);
  appendQuad(builder, v2!, v6!, v7!, v3!);
  appendQuad(builder, v0!, v3!, v7!, v4!);
  appendQuad(builder, v1!, v5!, v6!, v2!);
}

/**
 * Appends two triangles for a quad face.
 *
 * @param builder Topology builder.
 * @param a First corner.
 * @param b Second corner.
 * @param c Third corner.
 * @param d Fourth corner.
 */
function appendQuad(builder: MeshTopologyBuilder, a: number, b: number, c: number, d: number): void {
  builder.appendTriangle(a, b, c);
  builder.appendTriangle(a, c, d);
}
