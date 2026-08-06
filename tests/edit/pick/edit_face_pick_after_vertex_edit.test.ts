import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { createMeshDocumentBox } from '@/mesh/primitive/mesh_primitive_box.js';
import { meshDocumentToBufferGeometry } from '@/mesh/convert/mesh_to_buffer_geometry.js';
import { writePersistentMeshDocument } from '@/mesh/document/mesh_document_binding.js';
import { ensureMeshEditDocument } from '@/edit/mesh/mesh_edit_binding.js';
import { applyComponentTranslationDelta } from '@/edit/transform/component_transform_apply.js';
import { readComponentTransformVertexLocal } from '@/edit/transform/component_transform_vertex.js';
import type { ComponentTransformMeshVertex } from '@/edit/transform/component_transform_vertex.js';
import { meshDocumentFaceIndexFromDisplayTriangle } from '@/mesh/convert/mesh_document_face_triangle_map.js';
import { setFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';
import { createDefaultFaceTextureMapping } from '@/texture/uv/face_texture_mapping.js';
import { rebuildSurfaceMaterials } from '@/texture/material/builder_surface_material.js';
import { setTextureMapCacheForTests, TextureMapCache } from '@/texture/library/texture_map_cache.js';
import { countTriangles } from '@/texture/uv/planar_uv_projector.js';
import { getOrBuildFacePickBvh } from '@/selection/pick/mesh_pick_acceleration.js';

/**
 * After vertex edit rebuilds display geometry (including multi-material
 * groups), Edit Mode face pick must still map GPU triangles to document faces.
 */
describe('edit face pick after vertex edit', () => {
  beforeEach(() => {
    setTextureMapCacheForTests(new TextureMapCache());
  });

  afterEach(() => {
    setTextureMapCacheForTests(null);
  });

  it('maps every display triangle to a document face after multi-texture vertex edit', () => {
    const mesh = createMultiTextureContentBox();
    const document = ensureMeshEditDocument(mesh);
    expect(document).toBeTruthy();
    if (!document) {
      return;
    }
    const vertexIndex = findDocumentVertexIndexWithMaxX(document);
    const transformVertex = buildMeshTransformVertex(mesh, document, vertexIndex);
    applyComponentTranslationDelta([transformVertex], new THREE.Vector3(0.75, 0, 0));

    const triangleCount = countTriangles(mesh.geometry);
    expect(triangleCount).toBeGreaterThan(0);
    const faceCount = document.getTopology().getFaceCount();
    const seenFaces = new Set<number>();
    for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex++) {
      const faceIndex = meshDocumentFaceIndexFromDisplayTriangle(document, triangleIndex);
      expect(faceIndex, `triangle ${triangleIndex}`).not.toBeNull();
      expect(faceIndex!).toBeGreaterThanOrEqual(0);
      expect(faceIndex!).toBeLessThan(faceCount);
      seenFaces.add(faceIndex!);
    }
    expect(seenFaces.size).toBe(faceCount);
    expect(Array.isArray(mesh.material)).toBe(true);
    expect(mesh.geometry.groups.length).toBeGreaterThan(0);
  });

  it('rebuilds face-pick BVH against post-edit positions', () => {
    const mesh = createMultiTextureContentBox();
    const document = ensureMeshEditDocument(mesh);
    expect(document).toBeTruthy();
    if (!document) {
      return;
    }
    const vertexIndex = findDocumentVertexIndexWithMaxX(document);
    const transformVertex = buildMeshTransformVertex(mesh, document, vertexIndex);
    applyComponentTranslationDelta([transformVertex], new THREE.Vector3(1.25, 0, 0));
    const bvh = getOrBuildFacePickBvh(mesh);
    expect(bvh).toBeTruthy();
    const maxX = readGeometryMaxX(mesh.geometry);
    expect(maxX).toBeGreaterThan(1);
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
