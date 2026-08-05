import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MeshDocument } from '@/mesh/document/mesh_document.js';
import { MeshTopologyBuilder } from '@/mesh/topology/mesh_topology_builder.js';
import { MESH_EDIT_DOCUMENT_USERDATA_KEY } from '@/edit/mesh/mesh_edit_binding.js';
import { applyObjectTransformToContentMesh } from '@/transform/apply/object_apply_transform_mesh.js';
import { objectApplyTransformFlagsFromKind } from '@/transform/apply/object_apply_transform_flags.js';
import { ObjectApplyTransformKind } from '@/types/object_apply_transform_kind.js';

/**
 * Builds a unit triangle mesh with a bound MeshDocument.
 *
 * @returns Mesh at a non-identity pose.
 */
function createDocumentMeshAtPose(): THREE.Mesh {
  const builder = new MeshTopologyBuilder();
  const a = builder.appendVertex(0, 0, 0);
  const b = builder.appendVertex(1, 0, 0);
  const c = builder.appendVertex(0, 1, 0);
  builder.appendFace([a, b, c]);
  const document = new MeshDocument(builder.build());
  const mesh = new THREE.Mesh(new THREE.BufferGeometry());
  mesh.userData[MESH_EDIT_DOCUMENT_USERDATA_KEY] = document;
  mesh.position.set(2, 0, 0);
  mesh.rotation.set(0, Math.PI / 2, 0);
  mesh.scale.set(2, 2, 2);
  mesh.updateMatrixWorld(true);
  return mesh;
}

describe('applyObjectTransformToContentMesh', () => {
  it('bakes all transforms into document vertices and clears object pose', () => {
    const mesh = createDocumentMeshAtPose();
    const flags = objectApplyTransformFlagsFromKind(ObjectApplyTransformKind.ALL_TRANSFORMS);
    const snapshot = applyObjectTransformToContentMesh(mesh, flags);
    expect(snapshot).not.toBeNull();
    expect(mesh.position.lengthSq()).toBeCloseTo(0, 5);
    expect(mesh.scale.x).toBeCloseTo(1, 5);
    expect(mesh.rotation.y).toBeCloseTo(0, 5);
    const document = mesh.userData[MESH_EDIT_DOCUMENT_USERDATA_KEY] as MeshDocument;
    const positions = document.getTopology().getPositions();
    expect(Math.hypot(positions[0]!, positions[1]!, positions[2]!)).toBeGreaterThan(0.5);
  });

  it('applies location only and keeps rotation and scale', () => {
    const mesh = createDocumentMeshAtPose();
    const flags = objectApplyTransformFlagsFromKind(ObjectApplyTransformKind.LOCATION);
    applyObjectTransformToContentMesh(mesh, flags);
    expect(mesh.position.lengthSq()).toBeCloseTo(0, 5);
    expect(mesh.scale.x).toBeCloseTo(2, 5);
    expect(Math.abs(mesh.rotation.y)).toBeGreaterThan(0.1);
  });

  it('apply location with non-uniform scale preserves world vertices', () => {
    const mesh = createDocumentMeshAtPose();
    mesh.position.set(4, 1, -1);
    mesh.rotation.set(0, 0, 0);
    mesh.scale.set(2, 0.5, 1.5);
    mesh.updateMatrixWorld(true);
    const beforeWorld = collectDocumentWorldVertices(mesh);
    applyObjectTransformToContentMesh(mesh, objectApplyTransformFlagsFromKind(ObjectApplyTransformKind.LOCATION));
    expect(mesh.position.lengthSq()).toBeCloseTo(0, 5);
    expect(mesh.scale.x).toBeCloseTo(2, 5);
    expectWorldVerticesMatch(beforeWorld, collectDocumentWorldVertices(mesh));
  });

  it('apply rotation with non-uniform scale preserves world vertices', () => {
    const mesh = createDocumentMeshAtPose();
    mesh.position.set(1, 0, 2);
    mesh.rotation.set(0.3, 0.8, -0.1);
    mesh.scale.set(2, 0.5, 1.25);
    mesh.updateMatrixWorld(true);
    const beforeWorld = collectDocumentWorldVertices(mesh);
    applyObjectTransformToContentMesh(mesh, objectApplyTransformFlagsFromKind(ObjectApplyTransformKind.ROTATION));
    expect(mesh.rotation.x).toBeCloseTo(0, 5);
    expect(mesh.rotation.y).toBeCloseTo(0, 5);
    expect(mesh.rotation.z).toBeCloseTo(0, 5);
    expect(mesh.scale.x).toBeCloseTo(2, 5);
    expectWorldVerticesMatch(beforeWorld, collectDocumentWorldVertices(mesh));
  });
});

/**
 * Reads mesh-document vertices transformed by the mesh local matrix.
 *
 * @param mesh Content mesh with a bound document.
 * @returns World-space (object-local parent space) positions.
 */
function collectDocumentWorldVertices(mesh: THREE.Mesh): THREE.Vector3[] {
  mesh.updateMatrix();
  const document = mesh.userData[MESH_EDIT_DOCUMENT_USERDATA_KEY] as MeshDocument;
  const positions = document.getTopology().getPositions();
  const count = document.getTopology().getVertexCount();
  const points: THREE.Vector3[] = [];
  for (let index = 0; index < count; index++) {
    const base = index * 3;
    const point = new THREE.Vector3(positions[base]!, positions[base + 1]!, positions[base + 2]!);
    point.applyMatrix4(mesh.matrix);
    points.push(point);
  }
  return points;
}

/**
 * Asserts two point lists match within a tight epsilon.
 *
 * @param before Points before apply.
 * @param after Points after apply.
 */
function expectWorldVerticesMatch(before: readonly THREE.Vector3[], after: readonly THREE.Vector3[]): void {
  expect(after).toHaveLength(before.length);
  for (let index = 0; index < before.length; index++) {
    expect(after[index]!.distanceTo(before[index]!)).toBeLessThan(1e-5);
  }
}
