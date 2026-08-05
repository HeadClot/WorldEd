import { MESH_FACE_WALK_SAFETY_LIMIT } from './mesh_topology_constants.js';
import { MESH_HALF_EDGE_BOUNDARY_TWIN, MESH_HALF_EDGE_NO_FACE } from './mesh_half_edge.js';
import type { MeshTopology } from './mesh_topology.js';
import { meshTopologyFaceHalfEdgeIndices, meshTopologyTwinIndexIsValid } from './mesh_topology_query.js';

/** Result of validating mesh topology integrity. */
export interface MeshTopologyValidationResult {
  /** True when no issues were found. */
  isValid: boolean;
  /** Human-readable issue list. */
  issues: string[];
}

/**
 * Validates half-edge links, face loops, and twin pairing for a topology.
 *
 * @param topology Topology to validate.
 * @returns Validation result with issue messages.
 */
export function validateMeshTopology(topology: MeshTopology): MeshTopologyValidationResult {
  const issues: string[] = [];
  collectHalfEdgeIndexIssues(topology, issues);
  collectFaceLoopIssues(topology, issues);
  collectTwinPairIssues(topology, issues);
  return {
    isValid: issues.length === 0,
    issues,
  };
}

/**
 * Collects issues for out-of-range next/twin/face indices on half-edges.
 *
 * @param topology Mesh topology.
 * @param issues Issue accumulator.
 */
function collectHalfEdgeIndexIssues(topology: MeshTopology, issues: string[]): void {
  const halfEdgeCount = topology.getHalfEdgeCount();
  const faceCount = topology.getFaceCount();
  const vertexCount = topology.getVertexCount();
  for (let index = 0; index < halfEdgeCount; index++) {
    appendHalfEdgeFieldIssues(topology, index, halfEdgeCount, faceCount, vertexCount, issues);
  }
}

/**
 * Appends field-level issues for one half-edge.
 *
 * @param topology Mesh topology.
 * @param halfEdgeIndex Half-edge index.
 * @param halfEdgeCount Total half-edges.
 * @param faceCount Total faces.
 * @param vertexCount Total vertices.
 * @param issues Issue accumulator.
 */
function appendHalfEdgeFieldIssues(
  topology: MeshTopology,
  halfEdgeIndex: number,
  halfEdgeCount: number,
  faceCount: number,
  vertexCount: number,
  issues: string[],
): void {
  const edge = topology.getHalfEdge(halfEdgeIndex);
  if (edge.vertexIndex < 0 || edge.vertexIndex >= vertexCount) {
    issues.push(`halfEdge ${halfEdgeIndex}: invalid vertexIndex ${edge.vertexIndex}`);
  }
  if (edge.nextIndex < 0 || edge.nextIndex >= halfEdgeCount) {
    issues.push(`halfEdge ${halfEdgeIndex}: invalid nextIndex ${edge.nextIndex}`);
  }
  if (!meshTopologyTwinIndexIsValid(topology, edge.twinIndex)) {
    issues.push(`halfEdge ${halfEdgeIndex}: invalid twinIndex ${edge.twinIndex}`);
  }
  if (edge.faceIndex !== MESH_HALF_EDGE_NO_FACE) {
    if (edge.faceIndex < 0 || edge.faceIndex >= faceCount) {
      issues.push(`halfEdge ${halfEdgeIndex}: invalid faceIndex ${edge.faceIndex}`);
    }
  }
}

/**
 * Collects issues for face loops that do not close or exceed the safety limit.
 *
 * @param topology Mesh topology.
 * @param issues Issue accumulator.
 */
function collectFaceLoopIssues(topology: MeshTopology, issues: string[]): void {
  const faceCount = topology.getFaceCount();
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    appendFaceLoopIssues(topology, faceIndex, issues);
  }
}

/**
 * Validates one face loop closure and ownership.
 *
 * @param topology Mesh topology.
 * @param faceIndex Face index.
 * @param issues Issue accumulator.
 */
function appendFaceLoopIssues(topology: MeshTopology, faceIndex: number, issues: string[]): void {
  const halfEdgeIndices = meshTopologyFaceHalfEdgeIndices(topology, faceIndex);
  if (halfEdgeIndices.length === 0) {
    issues.push(`face ${faceIndex}: empty loop`);
    return;
  }
  if (halfEdgeIndices.length >= MESH_FACE_WALK_SAFETY_LIMIT) {
    issues.push(`face ${faceIndex}: loop exceeded safety limit`);
    return;
  }
  for (const halfEdgeIndex of halfEdgeIndices) {
    if (topology.getHalfEdge(halfEdgeIndex).faceIndex !== faceIndex) {
      issues.push(`face ${faceIndex}: halfEdge ${halfEdgeIndex} faceIndex mismatch`);
    }
  }
}

/**
 * Collects twin pairing issues (non-reciprocal twins).
 *
 * @param topology Mesh topology.
 * @param issues Issue accumulator.
 */
function collectTwinPairIssues(topology: MeshTopology, issues: string[]): void {
  const halfEdgeCount = topology.getHalfEdgeCount();
  for (let halfEdgeIndex = 0; halfEdgeIndex < halfEdgeCount; halfEdgeIndex++) {
    appendTwinReciprocalIssue(topology, halfEdgeIndex, issues);
  }
}

/**
 * Ensures a non-boundary twin points back to the original half-edge.
 *
 * @param topology Mesh topology.
 * @param halfEdgeIndex Half-edge index.
 * @param issues Issue accumulator.
 */
function appendTwinReciprocalIssue(topology: MeshTopology, halfEdgeIndex: number, issues: string[]): void {
  const twinIndex = topology.getHalfEdge(halfEdgeIndex).twinIndex;
  if (twinIndex === MESH_HALF_EDGE_BOUNDARY_TWIN) {
    return;
  }
  const twin = topology.getHalfEdge(twinIndex);
  if (twin.twinIndex !== halfEdgeIndex) {
    issues.push(`halfEdge ${halfEdgeIndex}: twin ${twinIndex} is not reciprocal`);
  }
}
