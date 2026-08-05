import * as THREE from 'three';
import type { ComponentSelectionEntry } from '@/edit/component/component_selection_entry.js';
import type { EditDomainTarget } from '@/edit/session/edit_session_domain.js';
import { readBoundMeshEditDocument } from '@/edit/mesh/mesh_edit_binding.js';
import {
  meshTopologyFaceHalfEdgeIndices,
  meshTopologyHalfEdgeCornerVertex,
} from '@/mesh/topology/mesh_topology_query.js';
import type { ComponentTransformVertex } from './component_transform_vertex.js';
import { componentTransformLocalToWorld, readComponentTransformVertexLocal } from './component_transform_vertex.js';

/**
 * Expands component selection into unique movable vertices for transform.
 *
 * @param selected Component selection entries.
 * @param domain Edit Mode domain.
 * @returns Movable vertices with initial local snapshots.
 */
export function expandComponentSelectionToTransformVertices(
  selected: readonly ComponentSelectionEntry[],
  domain: readonly EditDomainTarget[],
): ComponentTransformVertex[] {
  const byKey = new Map<string, ComponentTransformVertex>();
  for (const entry of selected) {
    appendEntryVertices(entry, domain, byKey);
  }
  return Array.from(byKey.values());
}

/**
 * Computes the world-space centroid of transform vertices.
 *
 * @param vertices Transform vertices.
 * @returns World pivot, or null when empty.
 */
export function computeComponentTransformPivot(vertices: readonly ComponentTransformVertex[]): THREE.Vector3 | null {
  if (vertices.length === 0) {
    return null;
  }
  const pivot = new THREE.Vector3();
  for (const vertex of vertices) {
    const world = componentVertexWorld(vertex);
    pivot.add(world);
  }
  return pivot.multiplyScalar(1 / vertices.length);
}

/**
 * Appends movable vertices for one selection entry.
 *
 * @param entry Selection entry.
 * @param domain Domain targets.
 * @param byKey Output map.
 */
function appendEntryVertices(
  entry: ComponentSelectionEntry,
  domain: readonly EditDomainTarget[],
  byKey: Map<string, ComponentTransformVertex>,
): void {
  const target = domain.find((item) => item.targetId === entry.targetId);
  if (!target) {
    return;
  }
  if (target.kind === 'content_mesh') {
    appendMeshEntryVertices(entry, target.mesh, byKey);
    return;
  }
  appendBrushEntryVertices(entry, target, byKey);
}

/**
 * Appends content-mesh vertices for one selection entry.
 *
 * @param entry Selection entry.
 * @param mesh Content mesh.
 * @param byKey Output map.
 */
function appendMeshEntryVertices(
  entry: ComponentSelectionEntry,
  mesh: THREE.Mesh,
  byKey: Map<string, ComponentTransformVertex>,
): void {
  const document = readBoundMeshEditDocument(mesh);
  if (!document) {
    return;
  }
  for (const vertexIndex of collectMeshVertexIndices(entry, document)) {
    addMeshVertex(byKey, entry.targetId, mesh, document, vertexIndex);
  }
}

/**
 * Collects vertex indices implied by a mesh selection entry.
 *
 * @param entry Selection entry.
 * @param document Mesh document.
 * @returns Vertex indices.
 */
function collectMeshVertexIndices(
  entry: ComponentSelectionEntry,
  document: import('@/mesh/document/mesh_document.js').MeshDocument,
): number[] {
  if (entry.kind === 'vertex') {
    return [Number(entry.componentKey)];
  }
  const topology = document.getTopology();
  if (entry.kind === 'edge') {
    return parseEdgeVertexIndices(entry.componentKey);
  }
  const faceIndex = Number(entry.componentKey);
  if (!Number.isFinite(faceIndex) || faceIndex < 0 || faceIndex >= topology.getFaceCount()) {
    return [];
  }
  const indices: number[] = [];
  for (const halfEdgeIndex of meshTopologyFaceHalfEdgeIndices(topology, faceIndex)) {
    indices.push(meshTopologyHalfEdgeCornerVertex(topology, halfEdgeIndex));
  }
  return indices;
}

/**
 * Appends brush vertices for one selection entry.
 *
 * @param entry Selection entry.
 * @param target Brush domain target.
 * @param byKey Output map.
 */
function appendBrushEntryVertices(
  entry: ComponentSelectionEntry,
  target: Extract<EditDomainTarget, { kind: 'brush' }>,
  byKey: Map<string, ComponentTransformVertex>,
): void {
  const instance = target.solidModel.findBrush(target.brushId);
  if (!instance) {
    return;
  }
  const brush = instance.brush;
  for (const vertexIndex of collectBrushVertexIndices(entry, brush)) {
    addBrushVertex(byKey, target, brush, instance.mesh, vertexIndex);
  }
}

/**
 * Collects brush vertex indices for a selection entry.
 *
 * @param entry Selection entry.
 * @param brush Solid brush.
 * @returns Vertex indices.
 */
function collectBrushVertexIndices(
  entry: ComponentSelectionEntry,
  brush: import('@/solid/brush/solid_brush.js').SolidBrush,
): number[] {
  if (entry.kind === 'vertex') {
    return [Number(entry.componentKey)];
  }
  if (entry.kind === 'edge') {
    return parseEdgeVertexIndices(entry.componentKey);
  }
  const faceIndex = Number(entry.componentKey);
  if (!Number.isFinite(faceIndex) || faceIndex < 0 || faceIndex >= brush.faces.length) {
    return [];
  }
  return brush.getFaceVertexIndices(brush.faces[faceIndex]!);
}

/**
 * Parses an undirected edge key into vertex indices.
 *
 * @param edgeKey Edge key.
 * @returns Vertex indices.
 */
function parseEdgeVertexIndices(edgeKey: string): number[] {
  const parts = edgeKey.split(':');
  const a = Number(parts[0]);
  const b = Number(parts[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return [];
  }
  return [a, b];
}

/**
 * Inserts a mesh transform vertex if not already present.
 *
 * @param byKey Output map.
 * @param targetId Domain target id.
 * @param mesh Content mesh.
 * @param document Mesh document.
 * @param vertexIndex Vertex index.
 */
function addMeshVertex(
  byKey: Map<string, ComponentTransformVertex>,
  targetId: string,
  mesh: THREE.Mesh,
  document: import('@/mesh/document/mesh_document.js').MeshDocument,
  vertexIndex: number,
): void {
  if (!Number.isFinite(vertexIndex) || vertexIndex < 0) {
    return;
  }
  const key = `${targetId}:${vertexIndex}`;
  if (byKey.has(key)) {
    return;
  }
  const vertex: ComponentTransformVertex = {
    kind: 'mesh',
    targetId,
    vertexIndex,
    mesh,
    document,
    initialLocal: new THREE.Vector3(),
  };
  vertex.initialLocal.copy(readComponentTransformVertexLocal(vertex));
  byKey.set(key, vertex);
}

/**
 * Inserts a brush transform vertex if not already present.
 *
 * @param byKey Output map.
 * @param target Brush domain target.
 * @param brush Solid brush.
 * @param mesh Preview mesh.
 * @param vertexIndex Vertex index.
 */
function addBrushVertex(
  byKey: Map<string, ComponentTransformVertex>,
  target: Extract<EditDomainTarget, { kind: 'brush' }>,
  brush: import('@/solid/brush/solid_brush.js').SolidBrush,
  mesh: THREE.Mesh | null | undefined,
  vertexIndex: number,
): void {
  if (!Number.isFinite(vertexIndex) || vertexIndex < 0 || vertexIndex >= brush.vertices.length) {
    return;
  }
  const key = `${target.targetId}:${vertexIndex}`;
  if (byKey.has(key)) {
    return;
  }
  const vertex: ComponentTransformVertex = {
    kind: 'brush',
    targetId: target.targetId,
    vertexIndex,
    solidModel: target.solidModel,
    brushId: target.brushId,
    brush,
    mesh: mesh ?? null,
    initialLocal: brush.vertices[vertexIndex]!.clone(),
  };
  byKey.set(key, vertex);
}

/**
 * Reads a component vertex world position from its initial local snapshot.
 *
 * @param vertex Vertex descriptor.
 * @returns World position.
 */
function componentVertexWorld(vertex: ComponentTransformVertex): THREE.Vector3 {
  return componentTransformLocalToWorld(vertex, vertex.initialLocal);
}
