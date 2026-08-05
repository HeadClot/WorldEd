import type { MeshDocument } from '@/mesh/document/mesh_document.js';
import type { MeshTopology } from '@/mesh/topology/mesh_topology.js';
import {
  meshTopologyFaceHalfEdgeIndices,
  meshTopologyHalfEdgeCornerVertex,
  meshTopologyHalfEdgeDestinationVertex,
} from '@/mesh/topology/mesh_topology_query.js';
import type { BrushEditCage } from '@/edit/brush/brush_edit_cage.js';
import { buildComponentEdgeKey } from './component_selection_entry.js';

/** One undirected edge in a domain topology. */
export interface ComponentTopologyEdge {
  edgeKey: string;
  vertexA: number;
  vertexB: number;
}

/** One face loop in a domain topology. */
export interface ComponentTopologyFace {
  faceIndex: number;
  vertexIndices: number[];
  edgeKeys: string[];
}

/**
 * Topology used to convert component selection between vertex / edge / face
 * modes for one domain target.
 */
export interface ComponentTopologyTarget {
  targetId: string;
  edges: ComponentTopologyEdge[];
  faces: ComponentTopologyFace[];
}

/**
 * Builds conversion topology from a welded mesh document.
 *
 * @param targetId Domain target id.
 * @param document Mesh document.
 * @returns Topology target.
 */
export function buildComponentTopologyFromMeshDocument(
  targetId: string,
  document: MeshDocument,
): ComponentTopologyTarget {
  const topology = document.getTopology();
  return {
    targetId,
    edges: collectMeshDocumentEdges(topology),
    faces: collectMeshDocumentFaces(topology),
  };
}

/**
 * Builds conversion topology from a brush edit cage.
 *
 * @param cage Brush cage.
 * @returns Topology target.
 */
export function buildComponentTopologyFromBrushCage(cage: BrushEditCage): ComponentTopologyTarget {
  return {
    targetId: cage.targetId,
    edges: cage.edges.map((edge) => ({
      edgeKey: edge.edgeKey,
      vertexA: edge.vertexA,
      vertexB: edge.vertexB,
    })),
    faces: cage.faces.map((face) => ({
      faceIndex: face.faceIndex,
      vertexIndices: face.vertexIndices.slice(),
      edgeKeys: buildLoopEdgeKeys(face.vertexIndices),
    })),
  };
}

/**
 * Collects unique undirected edges from mesh topology.
 *
 * @param topology Mesh topology.
 * @returns Edge list.
 */
function collectMeshDocumentEdges(topology: MeshTopology): ComponentTopologyEdge[] {
  const edges: ComponentTopologyEdge[] = [];
  const seen = new Set<string>();
  const faceCount = topology.getFaceCount();
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    appendFaceEdges(topology, faceIndex, edges, seen);
  }
  return edges;
}

/**
 * Appends undirected edges for one mesh face.
 *
 * @param topology Mesh topology.
 * @param faceIndex Face index.
 * @param edges Output edges.
 * @param seen Deduped edge keys.
 */
function appendFaceEdges(
  topology: MeshTopology,
  faceIndex: number,
  edges: ComponentTopologyEdge[],
  seen: Set<string>,
): void {
  for (const halfEdgeIndex of meshTopologyFaceHalfEdgeIndices(topology, faceIndex)) {
    const vertexA = meshTopologyHalfEdgeCornerVertex(topology, halfEdgeIndex);
    const vertexB = meshTopologyHalfEdgeDestinationVertex(topology, halfEdgeIndex);
    const edgeKey = buildComponentEdgeKey(vertexA, vertexB);
    if (seen.has(edgeKey)) {
      continue;
    }
    seen.add(edgeKey);
    edges.push({ edgeKey, vertexA, vertexB });
  }
}

/**
 * Collects faces with vertex and edge keys from mesh topology.
 *
 * @param topology Mesh topology.
 * @returns Face list.
 */
function collectMeshDocumentFaces(topology: MeshTopology): ComponentTopologyFace[] {
  const faces: ComponentTopologyFace[] = [];
  const faceCount = topology.getFaceCount();
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    faces.push(buildMeshDocumentFace(topology, faceIndex));
  }
  return faces;
}

/**
 * Builds one face topology descriptor.
 *
 * @param topology Mesh topology.
 * @param faceIndex Face index.
 * @returns Face descriptor.
 */
function buildMeshDocumentFace(topology: MeshTopology, faceIndex: number): ComponentTopologyFace {
  const vertexIndices: number[] = [];
  const edgeKeys: string[] = [];
  for (const halfEdgeIndex of meshTopologyFaceHalfEdgeIndices(topology, faceIndex)) {
    const vertexA = meshTopologyHalfEdgeCornerVertex(topology, halfEdgeIndex);
    const vertexB = meshTopologyHalfEdgeDestinationVertex(topology, halfEdgeIndex);
    vertexIndices.push(vertexA);
    edgeKeys.push(buildComponentEdgeKey(vertexA, vertexB));
  }
  return { faceIndex, vertexIndices, edgeKeys };
}

/**
 * Builds undirected edge keys around an ordered vertex loop.
 *
 * @param vertexIndices Face loop.
 * @returns Edge keys.
 */
function buildLoopEdgeKeys(vertexIndices: readonly number[]): string[] {
  const edgeKeys: string[] = [];
  for (let index = 0; index < vertexIndices.length; index++) {
    const vertexA = vertexIndices[index]!;
    const vertexB = vertexIndices[(index + 1) % vertexIndices.length]!;
    edgeKeys.push(buildComponentEdgeKey(vertexA, vertexB));
  }
  return edgeKeys;
}
