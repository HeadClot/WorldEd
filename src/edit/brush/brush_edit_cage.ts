import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { SolidModel } from '@/solid/model/solid_model.js';
import { buildComponentEdgeKey } from '@/edit/component/component_selection_entry.js';

/** Wing-edge cage data for Edit Mode pick and display on one brush. */
export interface BrushEditCage {
  targetId: string;
  brushId: string;
  /** World-space vertex positions (one per brush vertex). */
  worldPositions: THREE.Vector3[];
  /** Undirected edge keys (`min:max`) with endpoint vertex indices. */
  edges: Array<{ edgeKey: string; vertexA: number; vertexB: number }>;
  /** Face loops as ordered local vertex indices. */
  faces: Array<{ faceIndex: number; vertexIndices: number[] }>;
  worldMatrix: THREE.Matrix4;
}

/**
 * Builds a world-space wing-edge cage for one solid brush instance.
 *
 * @param solidModel Owning solid model.
 * @param instance Brush instance.
 * @param targetId Domain target id.
 * @returns Cage for pick/highlight.
 */
export function buildBrushEditCage(
  solidModel: SolidModel,
  instance: SolidBrushInstance,
  targetId: string,
): BrushEditCage {
  const worldMatrix = buildBrushWorldMatrix(solidModel, instance);
  const brush = instance.brush;
  const worldPositions = brush.vertices.map((vertex) => vertex.clone().applyMatrix4(worldMatrix));
  const edges = collectUndirectedBrushEdges(brush);
  const faces = brush.faces.map((face, faceIndex) => ({
    faceIndex,
    vertexIndices: brush.getFaceVertexIndices(face),
  }));
  return {
    targetId,
    brushId: instance.id,
    worldPositions,
    edges,
    faces,
    worldMatrix,
  };
}

/**
 * Composes brush instance local matrix with the solid root world matrix.
 *
 * @param solidModel Solid model.
 * @param instance Brush instance.
 * @returns World matrix for brush local vertices.
 */
function buildBrushWorldMatrix(solidModel: SolidModel, instance: SolidBrushInstance): THREE.Matrix4 {
  const root = solidModel.root;
  root.updateMatrixWorld(true);
  const local = instance.getLocalMatrix();
  return root.matrixWorld.clone().multiply(local);
}

/**
 * Collects unique undirected edges from wing-edge topology.
 *
 * @param brush Solid brush.
 * @returns Edge list.
 */
function collectUndirectedBrushEdges(brush: SolidBrush): Array<{ edgeKey: string; vertexA: number; vertexB: number }> {
  const edges: Array<{ edgeKey: string; vertexA: number; vertexB: number }> = [];
  const seen = new Set<string>();
  for (let edgeIndex = 0; edgeIndex < brush.wingEdges.length; edgeIndex++) {
    const edge = brush.wingEdges[edgeIndex]!;
    const twinIndex = edge.twinIndex;
    if (twinIndex < 0 || twinIndex >= brush.wingEdges.length) {
      continue;
    }
    if (edgeIndex > twinIndex) {
      continue;
    }
    const vertexA = edge.vertexIndex;
    const vertexB = brush.wingEdges[twinIndex]!.vertexIndex;
    const edgeKey = buildComponentEdgeKey(vertexA, vertexB);
    if (seen.has(edgeKey)) {
      continue;
    }
    seen.add(edgeKey);
    edges.push({ edgeKey, vertexA, vertexB });
  }
  return edges;
}
