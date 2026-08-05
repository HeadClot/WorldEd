import { describe, it, expect } from 'vitest';
import { MeshTopologyBuilder } from '@/mesh/topology/mesh_topology_builder.js';
import { validateMeshTopology } from '@/mesh/topology/mesh_topology_validator.js';
import { createMeshHalfEdge, MESH_HALF_EDGE_BOUNDARY_TWIN } from '@/mesh/topology/mesh_half_edge.js';

describe('validateMeshTopology', () => {
  it('accepts a valid single triangle', () => {
    const builder = new MeshTopologyBuilder();
    const a = builder.appendVertex(0, 0, 0);
    const b = builder.appendVertex(1, 0, 0);
    const c = builder.appendVertex(0, 1, 0);
    builder.appendTriangle(a, b, c);
    const topology = builder.build();
    const result = validateMeshTopology(topology);
    expect(result.isValid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('detects a non-reciprocal twin', () => {
    const builder = new MeshTopologyBuilder();
    const a = builder.appendVertex(0, 0, 0);
    const b = builder.appendVertex(1, 0, 0);
    const c = builder.appendVertex(0, 1, 0);
    builder.appendTriangle(a, b, c);
    const topology = builder.build();
    const edge = topology.getHalfEdge(0);
    topology.writeHalfEdge(0, createMeshHalfEdge(edge.vertexIndex, 1, edge.nextIndex, edge.faceIndex));
    const result = validateMeshTopology(topology);
    expect(result.isValid).toBe(false);
    expect(result.issues.some((issue) => issue.includes('not reciprocal'))).toBe(true);
  });

  it('detects an invalid vertex index', () => {
    const builder = new MeshTopologyBuilder();
    const a = builder.appendVertex(0, 0, 0);
    const b = builder.appendVertex(1, 0, 0);
    const c = builder.appendVertex(0, 1, 0);
    builder.appendTriangle(a, b, c);
    const topology = builder.build();
    const edge = topology.getHalfEdge(0);
    topology.writeHalfEdge(0, createMeshHalfEdge(99, MESH_HALF_EDGE_BOUNDARY_TWIN, edge.nextIndex, edge.faceIndex));
    const result = validateMeshTopology(topology);
    expect(result.isValid).toBe(false);
    expect(result.issues.some((issue) => issue.includes('invalid vertexIndex'))).toBe(true);
  });
});
