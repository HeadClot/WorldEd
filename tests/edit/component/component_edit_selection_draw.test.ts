import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { meshDocumentFromBufferGeometryWelded } from '@/edit/mesh/mesh_edit_weld.js';
import { meshDocumentFromPolygonList } from '@/mesh/convert/mesh_from_polygon_list.js';
import { createMeshDocumentBox } from '@/mesh/primitive/mesh_primitive_box.js';
import {
  buildComponentCageDrawBuffers,
  buildComponentSelectionDrawBuffers,
  EDIT_CAGE_COLOR,
  EDIT_SELECTED_VERTEX_COLOR,
} from '@/edit/component/component_edit_selection_draw.js';
import { buildComponentEdgeKey } from '@/edit/component/component_selection_entry.js';
import {
  meshTopologyFaceHalfEdgeIndices,
  meshTopologyHalfEdgeCornerVertex,
  meshTopologyHalfEdgeDestinationVertex,
} from '@/mesh/topology/mesh_topology_query.js';

describe('buildComponentSelectionDrawBuffers', () => {
  it('draws half-edge gradients toward unselected ends for a selected vertex', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.Mesh(geometry);
    mesh.updateMatrixWorld(true);
    const document = meshDocumentFromBufferGeometryWelded(geometry);
    const buffers = buildComponentSelectionDrawBuffers(
      [{ targetId: mesh.uuid, mesh, document }],
      [],
      [{ targetId: mesh.uuid, kind: 'vertex', componentKey: '0' }],
    );
    expect(buffers.halfEdgeCoords.length).toBeGreaterThan(0);
    expect(buffers.halfEdgeColors.length).toBe(buffers.halfEdgeCoords.length);
    expect(buffers.fullEdgeCoords.length).toBe(0);
    geometry.dispose();
  });

  it('draws a full orange edge when an edge is selected', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.Mesh(geometry);
    mesh.updateMatrixWorld(true);
    const document = meshDocumentFromBufferGeometryWelded(geometry);
    const topology = document.getTopology();
    const halfEdge = meshTopologyFaceHalfEdgeIndices(topology, 0)[0]!;
    const a = meshTopologyHalfEdgeCornerVertex(topology, halfEdge);
    const b = meshTopologyHalfEdgeDestinationVertex(topology, halfEdge);
    const edgeKey = buildComponentEdgeKey(a, b);
    const buffers = buildComponentSelectionDrawBuffers(
      [{ targetId: mesh.uuid, mesh, document }],
      [],
      [{ targetId: mesh.uuid, kind: 'edge', componentKey: edgeKey }],
    );
    expect(buffers.fullEdgeCoords.length).toBe(6);
    geometry.dispose();
  });

  it('draws face fill and orange boundary edges for a selected face', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.Mesh(geometry);
    mesh.updateMatrixWorld(true);
    const document = meshDocumentFromBufferGeometryWelded(geometry);
    const buffers = buildComponentSelectionDrawBuffers(
      [{ targetId: mesh.uuid, mesh, document }],
      [],
      [{ targetId: mesh.uuid, kind: 'face', componentKey: '0' }],
    );
    expect(buffers.faceCoords.length).toBeGreaterThanOrEqual(9);
    expect(buffers.fullEdgeCoords.length).toBeGreaterThanOrEqual(18);
    geometry.dispose();
  });

  it('ear-clip fills a concave n-gon face with six triangles', () => {
    const positions = new Float32Array([0, 0, 0, 3, 0, 0, 3, 1, 0, 1, 1, 0, 1, 2, 0, 3, 2, 0, 3, 3, 0, 0, 3, 0]);
    const document = meshDocumentFromPolygonList(positions, [[0, 1, 2, 3, 4, 5, 6, 7]]);
    const mesh = new THREE.Mesh(new THREE.BufferGeometry());
    mesh.updateMatrixWorld(true);
    const buffers = buildComponentSelectionDrawBuffers(
      [{ targetId: mesh.uuid, mesh, document }],
      [],
      [{ targetId: mesh.uuid, kind: 'face', componentKey: '0' }],
    );
    // 8-gon → 6 triangles → 54 floats (ear-clip, not fan soup)
    expect(buffers.faceCoords.length).toBe(54);
  });

  it('fills a face when all of its vertices are selected', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.Mesh(geometry);
    mesh.updateMatrixWorld(true);
    const document = meshDocumentFromBufferGeometryWelded(geometry);
    const topology = document.getTopology();
    const faceVerts = new Set<number>();
    for (const halfEdgeIndex of meshTopologyFaceHalfEdgeIndices(topology, 0)) {
      faceVerts.add(meshTopologyHalfEdgeCornerVertex(topology, halfEdgeIndex));
    }
    const buffers = buildComponentSelectionDrawBuffers(
      [{ targetId: mesh.uuid, mesh, document }],
      [],
      [...faceVerts].map((vertexIndex) => ({
        targetId: mesh.uuid,
        kind: 'vertex' as const,
        componentKey: String(vertexIndex),
      })),
    );
    expect(buffers.faceCoords.length).toBeGreaterThanOrEqual(9);
    geometry.dispose();
  });

  it('fills a face when all of its edges are selected', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.Mesh(geometry);
    mesh.updateMatrixWorld(true);
    const document = meshDocumentFromBufferGeometryWelded(geometry);
    const topology = document.getTopology();
    const edgeKeys = new Set<string>();
    for (const halfEdgeIndex of meshTopologyFaceHalfEdgeIndices(topology, 0)) {
      const a = meshTopologyHalfEdgeCornerVertex(topology, halfEdgeIndex);
      const b = meshTopologyHalfEdgeDestinationVertex(topology, halfEdgeIndex);
      edgeKeys.add(buildComponentEdgeKey(a, b));
    }
    const buffers = buildComponentSelectionDrawBuffers(
      [{ targetId: mesh.uuid, mesh, document }],
      [],
      [...edgeKeys].map((edgeKey) => ({
        targetId: mesh.uuid,
        kind: 'edge' as const,
        componentKey: edgeKey,
      })),
    );
    expect(buffers.faceCoords.length).toBeGreaterThanOrEqual(9);
    geometry.dispose();
  });

  it('does not fill a quad face when only three of its four edges are selected', () => {
    const document = createMeshDocumentBox(1, 1, 1);
    const mesh = new THREE.Mesh(new THREE.BufferGeometry());
    mesh.updateMatrixWorld(true);
    const topology = document.getTopology();
    const edgeKeys: string[] = [];
    for (const halfEdgeIndex of meshTopologyFaceHalfEdgeIndices(topology, 0)) {
      const a = meshTopologyHalfEdgeCornerVertex(topology, halfEdgeIndex);
      const b = meshTopologyHalfEdgeDestinationVertex(topology, halfEdgeIndex);
      edgeKeys.push(buildComponentEdgeKey(a, b));
    }
    expect(edgeKeys.length).toBe(4);
    const partial = edgeKeys.slice(0, 3);
    const buffers = buildComponentSelectionDrawBuffers(
      [{ targetId: mesh.uuid, mesh, document }],
      [],
      partial.map((edgeKey) => ({
        targetId: mesh.uuid,
        kind: 'edge' as const,
        componentKey: edgeKey,
      })),
    );
    expect(buffers.faceCoords.length).toBe(0);
    expect(buffers.fullEdgeCoords.length).toBe(partial.length * 6);
  });
});

describe('buildComponentCageDrawBuffers', () => {
  it('keeps every vertex and recolors selected ones white on the same layer', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.Mesh(geometry);
    mesh.updateMatrixWorld(true);
    const document = meshDocumentFromBufferGeometryWelded(geometry);
    const vertexCount = document.getTopology().getVertexCount();
    const sources = [{ targetId: mesh.uuid, mesh, document }];
    const empty = buildComponentCageDrawBuffers(sources, [], []);
    const withVert = buildComponentCageDrawBuffers(
      sources,
      [],
      [{ targetId: mesh.uuid, kind: 'vertex', componentKey: '0' }],
    );
    expect(empty.vertexCoords.length).toBe(vertexCount * 3);
    expect(withVert.vertexCoords.length).toBe(vertexCount * 3);
    expect(withVert.vertexColors.length).toBe(vertexCount * 3);
    expect(empty.vertexColors.slice(0, 3)).toEqual(hexToRgb(EDIT_CAGE_COLOR));
    expect(withVert.vertexColors.slice(0, 3)).toEqual(hexToRgb(EDIT_SELECTED_VERTEX_COLOR));
    expect(withVert.vertexColors.slice(3, 6)).toEqual(hexToRgb(EDIT_CAGE_COLOR));
    geometry.dispose();
  });

  it('omits a fully selected edge from the black cage lines', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.Mesh(geometry);
    mesh.updateMatrixWorld(true);
    const document = meshDocumentFromBufferGeometryWelded(geometry);
    const topology = document.getTopology();
    const halfEdge = meshTopologyFaceHalfEdgeIndices(topology, 0)[0]!;
    const a = meshTopologyHalfEdgeCornerVertex(topology, halfEdge);
    const b = meshTopologyHalfEdgeDestinationVertex(topology, halfEdge);
    const edgeKey = buildComponentEdgeKey(a, b);
    const sources = [{ targetId: mesh.uuid, mesh, document }];
    const empty = buildComponentCageDrawBuffers(sources, [], []);
    const withEdge = buildComponentCageDrawBuffers(
      sources,
      [],
      [{ targetId: mesh.uuid, kind: 'edge', componentKey: edgeKey }],
    );
    expect(withEdge.edgeCoords.length).toBe(empty.edgeCoords.length - 6);
    geometry.dispose();
  });
});

/**
 * Converts a hex color to packed 0–1 rgb components matching draw buffers.
 *
 * @param hex Hex color.
 * @returns {undefined} R, g, b floats.
 */
function hexToRgb(hex: number): number[] {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}
