import { describe, it, expect } from 'vitest';
import { createMeshDocumentBox } from '@/mesh/primitive/mesh_primitive_box.js';
import { createMeshDocumentPlane } from '@/mesh/primitive/mesh_primitive_plane.js';
import { createMeshDocumentSphere } from '@/mesh/primitive/mesh_primitive_sphere.js';
import { createMeshDocumentCylinder } from '@/mesh/primitive/mesh_primitive_cylinder.js';
import { meshTopologyCountBoundaryHalfEdges } from '@/mesh/topology/mesh_topology_query.js';
import { validateMeshTopology } from '@/mesh/topology/mesh_topology_validator.js';
import { meshDocumentToBufferGeometry } from '@/mesh/convert/mesh_to_buffer_geometry.js';

describe('mesh primitives', () => {
  it('creates a closed box with twelve faces and no boundary', () => {
    const document = createMeshDocumentBox(2, 2, 2);
    const topology = document.getTopology();
    expect(topology.getVertexCount()).toBe(8);
    expect(topology.getFaceCount()).toBe(12);
    expect(meshTopologyCountBoundaryHalfEdges(topology)).toBe(0);
    expect(validateMeshTopology(topology).isValid).toBe(true);
  });

  it('creates an open plane with boundary edges', () => {
    const document = createMeshDocumentPlane(2, 2, 2, 2);
    const topology = document.getTopology();
    expect(topology.getFaceCount()).toBe(8);
    expect(meshTopologyCountBoundaryHalfEdges(topology)).toBeGreaterThan(0);
    expect(validateMeshTopology(topology).isValid).toBe(true);
  });

  it('creates a sphere with corner UVs and no planar surface table thrash', () => {
    const document = createMeshDocumentSphere(0.5, 16, 12);
    const topology = document.getTopology();
    expect(topology.getFaceCount()).toBeGreaterThan(100);
    expect(validateMeshTopology(topology).isValid).toBe(true);
    const surfaces = document.getAttributes().getFaceSurfaces();
    for (let faceIndex = 0; faceIndex < topology.getFaceCount(); faceIndex++) {
      expect(surfaces.get(faceIndex)).toBeUndefined();
    }
    const cornerUvs = document.getAttributes().getCornerUvs().getValues();
    expect(cornerUvs.length).toBe(topology.getHalfEdgeCount() * 2);
    expect(cornerUvs.some((value) => value !== 0)).toBe(true);
  });

  it('creates a cylinder that converts to buffer geometry', () => {
    const document = createMeshDocumentCylinder(0.5, 0.5, 1, 12, 1, false);
    expect(validateMeshTopology(document.getTopology()).isValid).toBe(true);
    const geometry = meshDocumentToBufferGeometry(document);
    const position = geometry.getAttribute('position');
    const uv = geometry.getAttribute('uv');
    expect(position.count).toBeGreaterThan(0);
    expect(uv.count).toBe(position.count);
  });
});
