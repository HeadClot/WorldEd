import { describe, it, expect } from 'vitest';
import { MeshTopologyBuilder } from '@/mesh/topology/mesh_topology_builder.js';
import { MeshDocument } from '@/mesh/document/mesh_document.js';
import { cloneMeshDocument } from '@/mesh/document/mesh_document_clone.js';

describe('MeshDocument', () => {
  it('sizes attributes to topology on construction', () => {
    const topology = buildSingleTriangleTopology();
    const document = new MeshDocument(topology);
    expect(document.getAttributes().getCornerUvs().getCornerCount()).toBe(3);
    expect(document.getAttributes().getFaceSurfaces().getSlotCount()).toBe(1);
    expect(document.getDirtyFlags().isAnyDirty()).toBe(true);
  });

  it('bumps geometry generation when marking dirty', () => {
    const document = new MeshDocument(buildSingleTriangleTopology());
    const generation = document.getGeometryGeneration();
    document.markPositionsDirty();
    expect(document.getGeometryGeneration()).toBe(generation + 1);
    document.markAttributesDirty();
    expect(document.getGeometryGeneration()).toBe(generation + 2);
  });

  it('clears dirty flags after presentation', () => {
    const document = new MeshDocument(buildSingleTriangleTopology());
    expect(document.getDirtyFlags().isAnyDirty()).toBe(true);
    document.clearDirtyFlagsAfterPresentation();
    expect(document.getDirtyFlags().isAnyDirty()).toBe(false);
  });

  it('cloneMeshDocument returns an independent copy', () => {
    const document = new MeshDocument(buildSingleTriangleTopology());
    const clone = cloneMeshDocument(document);
    document.getAttributes().getCornerUvs().write(0, 0.25, 0.75);
    const uv = { 0: 0, 1: 0, length: 2 };
    clone.getAttributes().getCornerUvs().read(0, uv);
    expect(uv[0]).toBe(0);
    expect(uv[1]).toBe(0);
  });
});

/**
 * Builds a one-triangle topology for document tests.
 *
 * @returns Mesh topology.
 */
function buildSingleTriangleTopology() {
  const builder = new MeshTopologyBuilder();
  const a = builder.appendVertex(0, 0, 0);
  const b = builder.appendVertex(1, 0, 0);
  const c = builder.appendVertex(0, 1, 0);
  builder.appendTriangle(a, b, c);
  return builder.build();
}
