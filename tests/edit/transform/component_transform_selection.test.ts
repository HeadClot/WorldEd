import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MeshDocument } from '@/mesh/document/mesh_document.js';
import { MeshTopologyBuilder } from '@/mesh/topology/mesh_topology_builder.js';
import { expandComponentSelectionToTransformVertices } from '@/edit/transform/component_transform_selection.js';
import { MESH_EDIT_DOCUMENT_USERDATA_KEY } from '@/edit/mesh/mesh_edit_binding.js';

describe('expandComponentSelectionToTransformVertices', () => {
  it('expands edge selection to both endpoint vertices', () => {
    const builder = new MeshTopologyBuilder();
    const a = builder.appendVertex(0, 0, 0);
    const b = builder.appendVertex(1, 0, 0);
    const c = builder.appendVertex(0, 1, 0);
    builder.appendFace([a, b, c]);
    const document = new MeshDocument(builder.build());
    const mesh = new THREE.Mesh(new THREE.BufferGeometry());
    mesh.userData[MESH_EDIT_DOCUMENT_USERDATA_KEY] = document;
    const vertices = expandComponentSelectionToTransformVertices(
      [{ targetId: mesh.uuid, kind: 'edge', componentKey: `${a}:${b}` }],
      [{ kind: 'content_mesh', mesh, targetId: mesh.uuid }],
    );
    expect(vertices).toHaveLength(2);
    expect(vertices.map((vertex) => vertex.vertexIndex).sort()).toEqual([a, b].sort());
  });
});
