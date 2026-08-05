import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { MeshDocument } from '@/mesh/document/mesh_document.js';
import { MeshTopologyBuilder } from '@/mesh/topology/mesh_topology_builder.js';
import { MESH_EDIT_DOCUMENT_USERDATA_KEY } from '@/edit/mesh/mesh_edit_binding.js';
import { HandlerComponentTransform } from '@/edit/transform/handler_component_transform.js';
import { expandComponentSelectionToTransformVertices } from '@/edit/transform/component_transform_selection.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { GizmoAxis, TransformMode } from '@/types/transform_mode.js';
import { readComponentTransformVertexLocal } from '@/edit/transform/component_transform_vertex.js';

/**
 * Builds a triangle mesh document bound to a display mesh.
 *
 * @returns Mesh and document pair.
 */
function createTriangleMeshDocument(): { mesh: THREE.Mesh; document: MeshDocument } {
  const builder = new MeshTopologyBuilder();
  const a = builder.appendVertex(0, 0, 0);
  const b = builder.appendVertex(2, 0, 0);
  const c = builder.appendVertex(0, 2, 0);
  builder.appendFace([a, b, c]);
  const document = new MeshDocument(builder.build());
  const mesh = new THREE.Mesh(new THREE.BufferGeometry());
  mesh.userData[MESH_EDIT_DOCUMENT_USERDATA_KEY] = document;
  mesh.updateMatrixWorld(true);
  return { mesh, document };
}

/**
 * Builds a synthetic pick element with a fixed client rectangle.
 *
 * @returns HTML element for NDC projection.
 */
function createPickElement(): HTMLElement {
  const element = document.createElement('div');
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200 }),
  });
  return element;
}

describe('HandlerComponentTransform', () => {
  let handler: HandlerComponentTransform;
  let mesh: THREE.Mesh;
  let document: MeshDocument;
  let camera: THREE.PerspectiveCamera;
  let pickElement: HTMLElement;

  beforeEach(() => {
    handler = new HandlerComponentTransform(new GridSnap(false, 1), null);
    const created = createTriangleMeshDocument();
    mesh = created.mesh;
    document = created.document;
    camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    pickElement = createPickElement();
  });

  it('translates selected mesh vertices during a single-use drag', () => {
    const vertices = expandComponentSelectionToTransformVertices(
      [{ targetId: mesh.uuid, kind: 'vertex', componentKey: '0' }],
      [{ kind: 'content_mesh', mesh, targetId: mesh.uuid }],
    );
    const pivot = new THREE.Vector3(0, 0, 0);
    const started = handler.beginSingleUseDrag(TransformMode.TRANSLATE, vertices, pivot, camera, pickElement, 100, 100);
    expect(started).toBe(true);
    expect(handler.isSingleUseDrag()).toBe(true);
    handler.applyPointerMove(140, 100);
    const local = readComponentTransformVertexLocal(vertices[0]!);
    expect(local.x).not.toBe(0);
  });

  it('begins a permanent gizmo handle drag and rejects bounds mode', () => {
    const vertices = expandComponentSelectionToTransformVertices(
      [{ targetId: mesh.uuid, kind: 'vertex', componentKey: '0' }],
      [{ kind: 'content_mesh', mesh, targetId: mesh.uuid }],
    );
    const pivot = new THREE.Vector3(0, 0, 0);
    expect(
      handler.beginGizmoHandleDrag(
        TransformMode.BOUNDS,
        GizmoAxis.X,
        new THREE.Quaternion(),
        vertices,
        pivot,
        camera,
        pickElement,
        100,
        100,
      ),
    ).toBe(false);
    const started = handler.beginGizmoHandleDrag(
      TransformMode.TRANSLATE,
      GizmoAxis.X,
      new THREE.Quaternion(),
      vertices,
      pivot,
      camera,
      pickElement,
      100,
      100,
    );
    expect(started).toBe(true);
    expect(handler.isPermanentDrag()).toBe(true);
    expect(handler.isSingleUseDrag()).toBe(false);
  });

  it('cancels a permanent drag and restores the initial vertex position', () => {
    const vertices = expandComponentSelectionToTransformVertices(
      [{ targetId: mesh.uuid, kind: 'vertex', componentKey: '0' }],
      [{ kind: 'content_mesh', mesh, targetId: mesh.uuid }],
    );
    const before = readComponentTransformVertexLocal(vertices[0]!);
    handler.beginGizmoHandleDrag(
      TransformMode.TRANSLATE,
      GizmoAxis.X,
      new THREE.Quaternion(),
      vertices,
      new THREE.Vector3(0, 0, 0),
      camera,
      pickElement,
      100,
      100,
    );
    handler.applyPointerMove(160, 100);
    handler.cancelIfNeeded();
    const after = readComponentTransformVertexLocal(vertices[0]!);
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
    expect(after.z).toBeCloseTo(before.z, 5);
    expect(handler.isDragging()).toBe(false);
    void document;
  });
});
