import { describe, it, expect } from 'vitest';
import { MeshTopologyBuilder } from '@/mesh/topology/mesh_topology_builder.js';
import {
  meshTopologyCountBoundaryHalfEdges,
  meshTopologyFaceVertexIndices,
} from '@/mesh/topology/mesh_topology_query.js';
import { validateMeshTopology } from '@/mesh/topology/mesh_topology_validator.js';
import { meshHalfEdgeIsBoundary } from '@/mesh/topology/mesh_half_edge.js';

describe('MeshTopologyBuilder', () => {
  it('builds a closed box with twelve triangles and no boundary edges', () => {
    const topology = buildUnitBoxTopology();
    expect(topology.getVertexCount()).toBe(8);
    expect(topology.getFaceCount()).toBe(12);
    expect(topology.getHalfEdgeCount()).toBe(36);
    expect(meshTopologyCountBoundaryHalfEdges(topology)).toBe(0);
    expect(validateMeshTopology(topology).isValid).toBe(true);
  });

  it('builds an open plane with boundary half-edges', () => {
    const builder = new MeshTopologyBuilder();
    const v0 = builder.appendVertex(0, 0, 0);
    const v1 = builder.appendVertex(1, 0, 0);
    const v2 = builder.appendVertex(1, 0, 1);
    const v3 = builder.appendVertex(0, 0, 1);
    builder.appendTriangle(v0, v1, v2);
    builder.appendTriangle(v0, v2, v3);
    const topology = builder.build();
    expect(topology.getFaceCount()).toBe(2);
    expect(meshTopologyCountBoundaryHalfEdges(topology)).toBe(4);
    expect(validateMeshTopology(topology).isValid).toBe(true);
    const interiorCount = countInteriorHalfEdges(topology);
    expect(interiorCount).toBe(2);
  });

  it('stores face-corner vertices in winding order', () => {
    const builder = new MeshTopologyBuilder();
    const a = builder.appendVertex(0, 0, 0);
    const b = builder.appendVertex(1, 0, 0);
    const c = builder.appendVertex(0, 1, 0);
    builder.appendTriangle(a, b, c);
    const topology = builder.build();
    expect(meshTopologyFaceVertexIndices(topology, 0)).toEqual([a, b, c]);
  });

  it('pairs twins reciprocally on a two-triangle quad', () => {
    const builder = new MeshTopologyBuilder();
    const v0 = builder.appendVertex(0, 0, 0);
    const v1 = builder.appendVertex(1, 0, 0);
    const v2 = builder.appendVertex(1, 0, 1);
    const v3 = builder.appendVertex(0, 0, 1);
    builder.appendTriangle(v0, v1, v2);
    builder.appendTriangle(v0, v2, v3);
    const topology = builder.build();
    const validation = validateMeshTopology(topology);
    expect(validation.issues).toEqual([]);
    let paired = 0;
    for (let index = 0; index < topology.getHalfEdgeCount(); index++) {
      const edge = topology.getHalfEdge(index);
      if (meshHalfEdgeIsBoundary(edge)) {
        continue;
      }
      paired += 1;
      expect(topology.getHalfEdge(edge.twinIndex).twinIndex).toBe(index);
    }
    expect(paired).toBe(2);
  });
});

/**
 * Builds a unit box from eight corners and twelve triangles.
 *
 * @returns Closed box topology.
 */
function buildUnitBoxTopology() {
  const builder = new MeshTopologyBuilder();
  const vertices = [
    builder.appendVertex(-0.5, -0.5, -0.5),
    builder.appendVertex(0.5, -0.5, -0.5),
    builder.appendVertex(0.5, 0.5, -0.5),
    builder.appendVertex(-0.5, 0.5, -0.5),
    builder.appendVertex(-0.5, -0.5, 0.5),
    builder.appendVertex(0.5, -0.5, 0.5),
    builder.appendVertex(0.5, 0.5, 0.5),
    builder.appendVertex(-0.5, 0.5, 0.5),
  ];
  appendBoxTriangles(builder, vertices);
  return builder.build();
}

/**
 * Appends twelve triangles for a box given eight corner indices.
 *
 * @param builder Topology builder.
 * @param vertices Eight corner indices.
 */
function appendBoxTriangles(builder: MeshTopologyBuilder, vertices: number[]): void {
  const [v0, v1, v2, v3, v4, v5, v6, v7] = vertices;
  appendQuadAsTriangles(builder, v0!, v1!, v2!, v3!);
  appendQuadAsTriangles(builder, v4!, v7!, v6!, v5!);
  appendQuadAsTriangles(builder, v0!, v4!, v5!, v1!);
  appendQuadAsTriangles(builder, v2!, v6!, v7!, v3!);
  appendQuadAsTriangles(builder, v0!, v3!, v7!, v4!);
  appendQuadAsTriangles(builder, v1!, v5!, v6!, v2!);
}

/**
 * Appends two triangles for a quad.
 *
 * @param builder Topology builder.
 * @param a First corner.
 * @param b Second corner.
 * @param c Third corner.
 * @param d Fourth corner.
 */
function appendQuadAsTriangles(builder: MeshTopologyBuilder, a: number, b: number, c: number, d: number): void {
  builder.appendTriangle(a, b, c);
  builder.appendTriangle(a, c, d);
}

/**
 * Counts non-boundary half-edges.
 *
 * @param topology Mesh topology.
 * @returns Interior half-edge count.
 */
function countInteriorHalfEdges(topology: ReturnType<MeshTopologyBuilder['build']>): number {
  let count = 0;
  for (let index = 0; index < topology.getHalfEdgeCount(); index++) {
    if (!meshHalfEdgeIsBoundary(topology.getHalfEdge(index))) {
      count += 1;
    }
  }
  return count;
}
