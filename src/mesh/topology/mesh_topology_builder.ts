import { createMeshFace } from './mesh_face.js';
import { MESH_HALF_EDGE_BOUNDARY_TWIN, createMeshHalfEdge } from './mesh_half_edge.js';
import { MeshTopology } from './mesh_topology.js';
import { MESH_VERTEX_POSITION_STRIDE } from './mesh_topology_constants.js';
import { meshVertexPositionWrite } from './mesh_vertex_position.js';

/**
 * Builds mesh topology from vertex positions and triangle index lists. Twins
 * are paired by directed edge keys; unpaired edges remain boundary.
 */
export class MeshTopologyBuilder {
  private readonly positions: number[];
  private readonly triangles: number[];

  /** Creates an empty builder. */
  constructor() {
    this.positions = [];
    this.triangles = [];
  }

  /**
   * Appends a vertex and returns its index.
   *
   * @param x Local X.
   * @param y Local Y.
   * @param z Local Z.
   * @returns New vertex index.
   */
  appendVertex(x: number, y: number, z: number): number {
    const vertexIndex = Math.floor(this.positions.length / MESH_VERTEX_POSITION_STRIDE);
    this.positions.push(x, y, z);
    return vertexIndex;
  }

  /**
   * Appends a triangle face by three vertex indices (winding order).
   *
   * @param vertexA First vertex index.
   * @param vertexB Second vertex index.
   * @param vertexC Third vertex index.
   */
  appendTriangle(vertexA: number, vertexB: number, vertexC: number): void {
    this.triangles.push(vertexA, vertexB, vertexC);
  }

  /**
   * Builds a topology from the accumulated vertices and triangles.
   *
   * @returns New mesh topology with paired twins.
   */
  build(): MeshTopology {
    const topology = new MeshTopology();
    topology.setPositions(Float32Array.from(this.positions));
    this.appendAllTrianglesToTopology(topology);
    pairMeshTopologyTwins(topology);
    return topology;
  }

  /**
   * Appends every stored triangle as a three-edge face loop.
   *
   * @param topology Target topology.
   */
  private appendAllTrianglesToTopology(topology: MeshTopology): void {
    const triangleCount = Math.floor(this.triangles.length / 3);
    for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex++) {
      const base = triangleIndex * 3;
      this.appendTriangleFace(topology, this.triangles[base]!, this.triangles[base + 1]!, this.triangles[base + 2]!);
    }
  }

  /**
   * Creates three half-edges and one face for a triangle.
   *
   * @param topology Target topology.
   * @param vertexA First corner vertex.
   * @param vertexB Second corner vertex.
   * @param vertexC Third corner vertex.
   */
  private appendTriangleFace(topology: MeshTopology, vertexA: number, vertexB: number, vertexC: number): void {
    appendTriangleFaceOnTopology(topology, vertexA, vertexB, vertexC);
  }
}

/**
 * Builds topology from a packed position buffer and triangle index list without
 * intermediate builder vertex allocation for positions.
 *
 * @param positions Packed xyz floats.
 * @param triangleIndices Flat triangle vertex indices.
 * @returns New mesh topology.
 */
export function meshTopologyFromTriangleBuffers(
  positions: Float32Array,
  triangleIndices: ArrayLike<number>,
): MeshTopology {
  const topology = new MeshTopology();
  topology.setPositions(new Float32Array(positions));
  appendTriangleIndicesAsFaces(topology, triangleIndices);
  pairMeshTopologyTwins(topology);
  return topology;
}

/**
 * Appends triangle faces from a flat index list.
 *
 * @param topology Target topology.
 * @param triangleIndices Flat vertex indices (groups of three).
 */
function appendTriangleIndicesAsFaces(topology: MeshTopology, triangleIndices: ArrayLike<number>): void {
  const triangleCount = Math.floor(triangleIndices.length / 3);
  for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex++) {
    const base = triangleIndex * 3;
    appendTriangleFaceOnTopology(
      topology,
      triangleIndices[base]!,
      triangleIndices[base + 1]!,
      triangleIndices[base + 2]!,
    );
  }
}

/**
 * Appends one triangle face loop on an existing topology. Half-edge vertexIndex
 * is the face-corner vertex in winding order.
 *
 * @param topology Target topology.
 * @param vertexA First corner vertex.
 * @param vertexB Second corner vertex.
 * @param vertexC Third corner vertex.
 */
function appendTriangleFaceOnTopology(topology: MeshTopology, vertexA: number, vertexB: number, vertexC: number): void {
  const edgeA = topology.getHalfEdgeCount();
  const edgeB = edgeA + 1;
  const edgeC = edgeA + 2;
  const faceIndex = topology.getFaceCount();
  topology.appendHalfEdge(createMeshHalfEdge(vertexA, MESH_HALF_EDGE_BOUNDARY_TWIN, edgeB, faceIndex));
  topology.appendHalfEdge(createMeshHalfEdge(vertexB, MESH_HALF_EDGE_BOUNDARY_TWIN, edgeC, faceIndex));
  topology.appendHalfEdge(createMeshHalfEdge(vertexC, MESH_HALF_EDGE_BOUNDARY_TWIN, edgeA, faceIndex));
  topology.appendFace(createMeshFace(edgeA));
}

/**
 * Pairs opposite half-edges by directed vertex pair. Leaves unpaired edges as
 * boundary.
 *
 * @param topology Topology whose twins are written in place.
 */
export function pairMeshTopologyTwins(topology: MeshTopology): void {
  const edgeKeyToHalfEdge = buildDirectedEdgeKeyMap(topology);
  const halfEdgeCount = topology.getHalfEdgeCount();
  for (let halfEdgeIndex = 0; halfEdgeIndex < halfEdgeCount; halfEdgeIndex++) {
    pairSingleHalfEdgeTwin(topology, halfEdgeIndex, edgeKeyToHalfEdge);
  }
}

/**
 * Maps each directed edge key to its half-edge index. With corner-vertex
 * half-edges, the directed edge runs from this corner to the next corner.
 *
 * @param topology Mesh topology.
 * @returns Map from "origin>dest" to half-edge index.
 */
function buildDirectedEdgeKeyMap(topology: MeshTopology): Map<string, number> {
  const map = new Map<string, number>();
  const halfEdgeCount = topology.getHalfEdgeCount();
  for (let halfEdgeIndex = 0; halfEdgeIndex < halfEdgeCount; halfEdgeIndex++) {
    const origin = topology.getHalfEdge(halfEdgeIndex).vertexIndex;
    const destination = topology.getHalfEdge(topology.getHalfEdge(halfEdgeIndex).nextIndex).vertexIndex;
    map.set(makeDirectedEdgeKey(origin, destination), halfEdgeIndex);
  }
  return map;
}

/**
 * Pairs one half-edge with its reverse directed twin when present.
 *
 * @param topology Mesh topology.
 * @param halfEdgeIndex Half-edge to pair.
 * @param edgeKeyToHalfEdge Directed edge lookup.
 */
function pairSingleHalfEdgeTwin(
  topology: MeshTopology,
  halfEdgeIndex: number,
  edgeKeyToHalfEdge: Map<string, number>,
): void {
  const halfEdge = topology.getHalfEdge(halfEdgeIndex);
  const origin = halfEdge.vertexIndex;
  const destination = topology.getHalfEdge(halfEdge.nextIndex).vertexIndex;
  const twinIndex = edgeKeyToHalfEdge.get(makeDirectedEdgeKey(destination, origin));
  if (twinIndex === undefined) {
    return;
  }
  topology.writeHalfEdge(
    halfEdgeIndex,
    createMeshHalfEdge(halfEdge.vertexIndex, twinIndex, halfEdge.nextIndex, halfEdge.faceIndex),
  );
}

/**
 * Builds a directed edge map key.
 *
 * @param origin Origin vertex index.
 * @param destination Destination vertex index.
 * @returns Stable string key.
 */
function makeDirectedEdgeKey(origin: number, destination: number): string {
  return `${origin}>${destination}`;
}

/**
 * Writes vertex positions into a pre-sized topology position buffer.
 *
 * @param topology Topology with positions already sized.
 * @param vertexIndex Vertex index.
 * @param x Local X.
 * @param y Local Y.
 * @param z Local Z.
 */
export function meshTopologyWriteVertex(
  topology: MeshTopology,
  vertexIndex: number,
  x: number,
  y: number,
  z: number,
): void {
  meshVertexPositionWrite(topology.getPositions(), vertexIndex, x, y, z);
}
