import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { EditorComponentMode } from '@/types/editor_component_mode.js';
import { meshDocumentFromBufferGeometryWelded } from '@/edit/mesh/mesh_edit_weld.js';
import { createMeshDocumentBox } from '@/mesh/primitive/mesh_primitive_box.js';
import { convertComponentSelectionForMode } from '@/edit/component/component_selection_mode_convert.js';
import { buildComponentTopologyFromMeshDocument } from '@/edit/component/component_selection_topology.js';
import { buildComponentEdgeKey } from '@/edit/component/component_selection_entry.js';

describe('convertComponentSelectionForMode', () => {
  it('expands a selected face into its edges and vertices', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const document = meshDocumentFromBufferGeometryWelded(geometry);
    const topology = buildComponentTopologyFromMeshDocument('mesh', document);
    const face = topology.faces[0]!;
    const faceSelected = convertComponentSelectionForMode(
      [{ targetId: 'mesh', kind: 'face', componentKey: String(face.faceIndex) }],
      EditorComponentMode.EDGE,
      [topology],
    );
    expect(faceSelected).toHaveLength(face.edgeKeys.length);
    expect(faceSelected.every((entry) => entry.kind === 'edge')).toBe(true);
    for (const edgeKey of face.edgeKeys) {
      expect(faceSelected.some((entry) => entry.componentKey === edgeKey)).toBe(true);
    }
    const vertexSelected = convertComponentSelectionForMode(faceSelected, EditorComponentMode.VERTEX, [topology]);
    const uniqueVerts = new Set(face.vertexIndices);
    expect(vertexSelected).toHaveLength(uniqueVerts.size);
    for (const vertexIndex of uniqueVerts) {
      expect(vertexSelected.some((entry) => entry.componentKey === String(vertexIndex))).toBe(true);
    }
    geometry.dispose();
  });

  it('contracts fully selected vertices back into edges and faces', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const document = meshDocumentFromBufferGeometryWelded(geometry);
    const topology = buildComponentTopologyFromMeshDocument('mesh', document);
    const face = topology.faces[0]!;
    const uniqueVerts = [...new Set(face.vertexIndices)];
    const vertexEntries = uniqueVerts.map((vertexIndex) => ({
      targetId: 'mesh' as const,
      kind: 'vertex' as const,
      componentKey: String(vertexIndex),
    }));
    const edgeSelected = convertComponentSelectionForMode(vertexEntries, EditorComponentMode.EDGE, [topology]);
    expect(edgeSelected.length).toBeGreaterThanOrEqual(face.edgeKeys.length);
    for (const edgeKey of face.edgeKeys) {
      expect(edgeSelected.some((entry) => entry.componentKey === edgeKey)).toBe(true);
    }
    const faceSelected = convertComponentSelectionForMode(edgeSelected, EditorComponentMode.FACE, [topology]);
    expect(faceSelected.some((entry) => entry.componentKey === String(face.faceIndex))).toBe(true);
    geometry.dispose();
  });

  it('keeps edge endpoints when switching from edge mode to vertex mode', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const document = meshDocumentFromBufferGeometryWelded(geometry);
    const topology = buildComponentTopologyFromMeshDocument('mesh', document);
    const edge = topology.edges[0]!;
    const edgeKey = buildComponentEdgeKey(edge.vertexA, edge.vertexB);
    const vertexSelected = convertComponentSelectionForMode(
      [{ targetId: 'mesh', kind: 'edge', componentKey: edgeKey }],
      EditorComponentMode.VERTEX,
      [topology],
    );
    expect(vertexSelected).toHaveLength(2);
    expect(vertexSelected.some((entry) => entry.componentKey === String(edge.vertexA))).toBe(true);
    expect(vertexSelected.some((entry) => entry.componentKey === String(edge.vertexB))).toBe(true);
    geometry.dispose();
  });

  it('drops a lone vertex when switching to edge mode but keeps complete edges', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const document = meshDocumentFromBufferGeometryWelded(geometry);
    const topology = buildComponentTopologyFromMeshDocument('mesh', document);
    const edge = topology.edges[0]!;
    const otherVertex = topology.edges.find(
      (item) => item.vertexA !== edge.vertexA && item.vertexB !== edge.vertexA,
    )?.vertexA;
    expect(otherVertex).toBeDefined();
    const converted = convertComponentSelectionForMode(
      [
        { targetId: 'mesh', kind: 'vertex', componentKey: String(edge.vertexA) },
        { targetId: 'mesh', kind: 'vertex', componentKey: String(edge.vertexB) },
        { targetId: 'mesh', kind: 'vertex', componentKey: String(otherVertex) },
      ],
      EditorComponentMode.EDGE,
      [topology],
    );
    expect(converted.some((entry) => entry.componentKey === edge.edgeKey)).toBe(true);
    const loneOnly = convertComponentSelectionForMode(
      [{ targetId: 'mesh', kind: 'vertex', componentKey: String(otherVertex) }],
      EditorComponentMode.EDGE,
      [topology],
    );
    expect(loneOnly).toHaveLength(0);
    geometry.dispose();
  });

  it('drops incomplete edge sets when switching to face mode', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const document = meshDocumentFromBufferGeometryWelded(geometry);
    const topology = buildComponentTopologyFromMeshDocument('mesh', document);
    const face = topology.faces[0]!;
    const partialEdgeKey = face.edgeKeys[0]!;
    const partial = convertComponentSelectionForMode(
      [{ targetId: 'mesh', kind: 'edge', componentKey: partialEdgeKey }],
      EditorComponentMode.FACE,
      [topology],
    );
    expect(partial).toHaveLength(0);
    const complete = convertComponentSelectionForMode(
      face.edgeKeys.map((edgeKey) => ({
        targetId: 'mesh' as const,
        kind: 'edge' as const,
        componentKey: edgeKey,
      })),
      EditorComponentMode.FACE,
      [topology],
    );
    expect(complete.some((entry) => entry.componentKey === String(face.faceIndex))).toBe(true);
    geometry.dispose();
  });

  it('does not promote three-of-four quad edges to a face, but does promote all four verts', () => {
    const document = createMeshDocumentBox(1, 1, 1);
    const topology = buildComponentTopologyFromMeshDocument('mesh', document);
    const face = topology.faces[0]!;
    expect(face.edgeKeys.length).toBe(4);
    const threeEdges = face.edgeKeys.slice(0, 3).map((edgeKey) => ({
      targetId: 'mesh' as const,
      kind: 'edge' as const,
      componentKey: edgeKey,
    }));
    const asFace = convertComponentSelectionForMode(threeEdges, EditorComponentMode.FACE, [topology]);
    expect(asFace).toHaveLength(0);
    const asVertex = convertComponentSelectionForMode(threeEdges, EditorComponentMode.VERTEX, [topology]);
    const uniqueVerts = new Set(face.vertexIndices);
    expect(asVertex).toHaveLength(uniqueVerts.size);
    for (const vertexIndex of uniqueVerts) {
      expect(asVertex.some((entry) => entry.componentKey === String(vertexIndex))).toBe(true);
    }
    const fromVertsToFace = convertComponentSelectionForMode(asVertex, EditorComponentMode.FACE, [topology]);
    expect(fromVertsToFace.some((entry) => entry.componentKey === String(face.faceIndex))).toBe(true);
  });
});
