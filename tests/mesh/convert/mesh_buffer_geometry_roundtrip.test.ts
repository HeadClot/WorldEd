import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { meshDocumentFromBufferGeometry } from '@/mesh/convert/mesh_from_buffer_geometry.js';
import { meshDocumentToBufferGeometry } from '@/mesh/convert/mesh_to_buffer_geometry.js';
import { meshDocumentFromTriangleList } from '@/mesh/convert/mesh_from_triangle_list.js';
import { meshDocumentFromPolygonList } from '@/mesh/convert/mesh_from_polygon_list.js';
import {
  meshTopologyCountBoundaryHalfEdges,
  meshTopologyFaceVertexIndices,
} from '@/mesh/topology/mesh_topology_query.js';
import { validateMeshTopology } from '@/mesh/topology/mesh_topology_validator.js';

describe('mesh buffer geometry convert', () => {
  it('imports a box geometry preserving triangle faces', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const document = meshDocumentFromBufferGeometry(geometry);
    const topology = document.getTopology();
    expect(topology.getFaceCount()).toBe(12);
    expect(topology.getVertexCount()).toBeGreaterThanOrEqual(8);
    expect(validateMeshTopology(topology).isValid).toBe(true);
  });

  it('imports a plane geometry as an open document with boundary edges', () => {
    const geometry = new THREE.PlaneGeometry(2, 2, 1, 1);
    const document = meshDocumentFromBufferGeometry(geometry);
    const topology = document.getTopology();
    expect(topology.getFaceCount()).toBe(2);
    expect(meshTopologyCountBoundaryHalfEdges(topology)).toBeGreaterThan(0);
    expect(validateMeshTopology(topology).isValid).toBe(true);
  });

  it('round-trips triangle positions through document expansion', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const indices = [0, 1, 2];
    const cornerUvs = new Float32Array([0, 0, 1, 0, 0, 1]);
    const document = meshDocumentFromTriangleList(positions, indices, cornerUvs);
    expect(meshTopologyFaceVertexIndices(document.getTopology(), 0)).toEqual([0, 1, 2]);
    const geometry = meshDocumentToBufferGeometry(document);
    const outPosition = geometry.getAttribute('position');
    const outUv = geometry.getAttribute('uv');
    expect(outPosition.count).toBe(3);
    expect(outUv.count).toBe(3);
    expect(outPosition.getX(0)).toBeCloseTo(0);
    expect(outPosition.getY(0)).toBeCloseTo(0);
    expect(outPosition.getZ(0)).toBeCloseTo(0);
    expect(outUv.getX(0)).toBeCloseTo(0);
    expect(outUv.getY(0)).toBeCloseTo(0);
    expect(outUv.getX(1)).toBeCloseTo(1);
    expect(outUv.getY(2)).toBeCloseTo(1);
  });

  it('round-trips a sphere without dropping triangle count', () => {
    const geometry = new THREE.SphereGeometry(0.5, 16, 12);
    const document = meshDocumentFromBufferGeometry(geometry);
    const triangleCount = countGeometryTriangles(geometry);
    expect(document.getTopology().getFaceCount()).toBe(triangleCount);
    const rebuilt = meshDocumentToBufferGeometry(document);
    expect(countGeometryTriangles(rebuilt)).toBe(triangleCount);
    expect(validateMeshTopology(document.getTopology()).isValid).toBe(true);
  });

  it('stores a quad face as one n-gon and expands to two display triangles', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]);
    const document = meshDocumentFromPolygonList(positions, [[0, 1, 2, 3]]);
    expect(document.getTopology().getFaceCount()).toBe(1);
    expect(document.getTopology().getHalfEdgeCount()).toBe(4);
    expect(meshTopologyFaceVertexIndices(document.getTopology(), 0)).toEqual([0, 1, 2, 3]);
    const geometry = meshDocumentToBufferGeometry(document);
    expect(countGeometryTriangles(geometry)).toBe(2);
    expect(validateMeshTopology(document.getTopology()).isValid).toBe(true);
  });

  it('clones a document independently', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const document = meshDocumentFromBufferGeometry(geometry);
    const clone = document.clone();
    expect(clone.getTopology().getFaceCount()).toBe(document.getTopology().getFaceCount());
    expect(clone.getGeometryGeneration()).toBe(document.getGeometryGeneration());
    document.markPositionsDirty();
    expect(document.getGeometryGeneration()).toBeGreaterThan(clone.getGeometryGeneration());
  });
});

/**
 * Counts triangles in a buffer geometry.
 *
 * @param geometry Geometry to measure.
 * @returns Triangle count.
 */
function countGeometryTriangles(geometry: THREE.BufferGeometry): number {
  const index = geometry.getIndex();
  if (index) {
    return Math.floor(index.count / 3);
  }
  const position = geometry.getAttribute('position');
  return position ? Math.floor(position.count / 3) : 0;
}
