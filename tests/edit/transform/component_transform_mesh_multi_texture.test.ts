import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { createMeshDocumentBox } from '@/mesh/primitive/mesh_primitive_box.js';
import { meshDocumentToBufferGeometry } from '@/mesh/convert/mesh_to_buffer_geometry.js';
import { writePersistentMeshDocument } from '@/mesh/document/mesh_document_binding.js';
import { ensureMeshEditDocument } from '@/edit/mesh/mesh_edit_binding.js';
import { applyComponentTranslationDelta } from '@/edit/transform/component_transform_apply.js';
import { readComponentTransformVertexLocal } from '@/edit/transform/component_transform_vertex.js';
import type { ComponentTransformMeshVertex } from '@/edit/transform/component_transform_vertex.js';
import { setFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';
import { createDefaultFaceTextureMapping } from '@/texture/uv/face_texture_mapping.js';
import { rebuildSurfaceMaterials } from '@/texture/material/builder_surface_material.js';
import { setTextureMapCacheForTests, TextureMapCache } from '@/texture/library/texture_map_cache.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import type { ComponentTransformBrushVertex } from '@/edit/transform/component_transform_vertex.js';

describe('component transform multi-texture geometry updates', () => {
  beforeEach(() => {
    setTextureMapCacheForTests(new TextureMapCache());
  });

  afterEach(() => {
    setTextureMapCacheForTests(null);
  });

  it('updates free-mesh geometry positions when multiple textures are assigned', () => {
    const mesh = createMultiTextureContentBox();
    const document = ensureMeshEditDocument(mesh);
    expect(document).toBeTruthy();
    if (!document) {
      return;
    }
    const vertexIndex = findDocumentVertexIndexWithMaxX(document);
    const transformVertex = buildMeshTransformVertex(mesh, document, vertexIndex);
    const localBefore = transformVertex.initialLocal.clone();
    applyComponentTranslationDelta([transformVertex], new THREE.Vector3(1.5, 0, 0));
    const localAfter = readComponentTransformVertexLocal(transformVertex);
    expect(localAfter.x).toBeCloseTo(localBefore.x + 1.5, 5);
    const maxXAfter = readGeometryMaxX(mesh.geometry);
    expect(maxXAfter).toBeCloseTo(localBefore.x + 1.5, 4);
    expect(mesh.geometry.groups.length).toBeGreaterThan(0);
    expect(Array.isArray(mesh.material)).toBe(true);
    expect((mesh.material as THREE.Material[]).length).toBe(2);
  });

  it('updates solid brush CSG result when the brush has multiple face textures', () => {
    const model = new SolidModel('MultiTexBrushEdit');
    const instance = model.addBoxBrush(2, SolidOperation.Additive);
    instance.setSurfaceTextureIdOnly('wall_default.png');
    for (let faceIndex = 0; faceIndex < instance.brush.faces.length; faceIndex++) {
      instance.setFaceTextureId(faceIndex, faceIndex % 2 === 0 ? 'floor_a.png' : 'wall_b.png');
    }
    model.rebuild(true);
    const brush = instance.brush;
    const mesh = instance.mesh;
    expect(mesh).toBeTruthy();
    if (!mesh) {
      return;
    }
    expect(Array.isArray(model.getResultMesh().material)).toBe(true);
    const beforeResultMaxX = readGeometryMaxX(model.getResultMesh().geometry);
    const positiveXVertices = findVertexIndicesWithMaxX(brush.vertices);
    const transformVertices: ComponentTransformBrushVertex[] = positiveXVertices.map((vertexIndex) => ({
      kind: 'brush' as const,
      targetId: instance.id,
      vertexIndex,
      solidModel: model,
      brushId: instance.id,
      brush,
      mesh,
      initialLocal: brush.vertices[vertexIndex]!.clone(),
    }));
    applyComponentTranslationDelta(transformVertices, new THREE.Vector3(0.75, 0, 0));
    const afterResultMaxX = readGeometryMaxX(model.getResultMesh().geometry);
    expect(afterResultMaxX).toBeGreaterThan(beforeResultMaxX + 0.5);
    expect(Array.isArray(model.getResultMesh().material)).toBe(true);
    expect(model.getResultMesh().geometry.groups.length).toBeGreaterThan(0);
  });
});

/**
 * Builds a content box mesh with two textures and multi-material groups.
 *
 * @returns Multi-texture content mesh.
 */
function createMultiTextureContentBox(): THREE.Mesh {
  const document = createMeshDocumentBox(2, 2, 2);
  const geometry = meshDocumentToBufferGeometry(document);
  const mesh = new THREE.Mesh(geometry);
  writePersistentMeshDocument(mesh, document);
  setFaceTextureMaps(mesh, [
    {
      triangleIndices: [0, 1, 2, 3],
      mapping: createDefaultFaceTextureMapping('a.png'),
    },
    {
      triangleIndices: [4, 5, 6, 7, 8, 9, 10, 11],
      mapping: createDefaultFaceTextureMapping('b.png'),
    },
  ]);
  rebuildSurfaceMaterials(mesh);
  return mesh;
}

/**
 * Builds a mesh transform vertex for component edit.
 *
 * @param mesh Content mesh.
 * @param document Bound mesh document.
 * @param vertexIndex Topology vertex index.
 * @returns Transform vertex.
 */
function buildMeshTransformVertex(
  mesh: THREE.Mesh,
  document: import('@/mesh/document/mesh_document.js').MeshDocument,
  vertexIndex: number,
): ComponentTransformMeshVertex {
  const vertex: ComponentTransformMeshVertex = {
    kind: 'mesh',
    targetId: mesh.uuid,
    vertexIndex,
    mesh,
    document,
    initialLocal: new THREE.Vector3(),
  };
  vertex.initialLocal.copy(readComponentTransformVertexLocal(vertex));
  return vertex;
}

/**
 * Finds a document topology vertex with maximum local X.
 *
 * @param document Mesh document.
 * @returns Vertex index.
 */
function findDocumentVertexIndexWithMaxX(document: import('@/mesh/document/mesh_document.js').MeshDocument): number {
  const positions = document.getTopology().getPositions();
  const vertexCount = document.getTopology().getVertexCount();
  let bestIndex = 0;
  let bestX = -Infinity;
  for (let index = 0; index < vertexCount; index++) {
    const x = positions[index * 3] ?? 0;
    if (x > bestX) {
      bestX = x;
      bestIndex = index;
    }
  }
  return bestIndex;
}

/**
 * Finds brush vertices with maximum local X.
 *
 * @param vertices Brush vertices.
 * @returns Vertex indices.
 */
function findVertexIndicesWithMaxX(vertices: readonly THREE.Vector3[]): number[] {
  let bestX = -Infinity;
  for (const vertex of vertices) {
    bestX = Math.max(bestX, vertex.x);
  }
  const indices: number[] = [];
  for (let index = 0; index < vertices.length; index++) {
    if (Math.abs(vertices[index]!.x - bestX) < 1e-6) {
      indices.push(index);
    }
  }
  return indices;
}

/**
 * Returns the maximum X of a geometry position attribute.
 *
 * @param geometry Buffer geometry.
 * @returns Max X.
 */
function readGeometryMaxX(geometry: THREE.BufferGeometry): number {
  const position = geometry.getAttribute('position');
  let maxX = -Infinity;
  for (let index = 0; index < position.count; index++) {
    maxX = Math.max(maxX, position.getX(index));
  }
  return maxX;
}
