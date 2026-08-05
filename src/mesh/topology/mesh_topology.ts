import { MeshFace, cloneMeshFace } from './mesh_face.js';
import { MeshHalfEdge, cloneMeshHalfEdge } from './mesh_half_edge.js';
import { meshVertexCountFromPositions, meshVertexPositionsClone } from './mesh_vertex_position.js';

/**
 * Editable mesh topology: packed vertex positions, half-edges, and faces. Open
 * meshes are allowed; boundary half-edges keep twinIndex as the boundary
 * sentinel.
 */
export class MeshTopology {
  private positions: Float32Array;
  private halfEdges: MeshHalfEdge[];
  private faces: MeshFace[];

  /**
   * Creates an empty topology or one with preallocated position capacity.
   *
   * @param positionCapacity Optional vertex capacity for packed positions.
   */
  constructor(positionCapacity: number = 0) {
    this.positions = new Float32Array(Math.max(0, positionCapacity) * 3);
    this.halfEdges = [];
    this.faces = [];
  }

  /**
   * Replaces the packed vertex position buffer.
   *
   * @param positions Packed xyz floats (length multiple of 3).
   */
  setPositions(positions: Float32Array): void {
    this.positions = positions;
  }

  /**
   * Returns the live packed vertex position buffer.
   *
   * @returns Packed xyz floats.
   */
  getPositions(): Float32Array {
    return this.positions;
  }

  /**
   * Returns the number of vertices.
   *
   * @returns Vertex count.
   */
  getVertexCount(): number {
    return meshVertexCountFromPositions(this.positions);
  }

  /**
   * Returns the number of half-edges.
   *
   * @returns Half-edge count.
   */
  getHalfEdgeCount(): number {
    return this.halfEdges.length;
  }

  /**
   * Returns the number of faces.
   *
   * @returns Face count.
   */
  getFaceCount(): number {
    return this.faces.length;
  }

  /**
   * Returns a half-edge by index.
   *
   * @param halfEdgeIndex Half-edge index.
   * @returns Half-edge value.
   */
  getHalfEdge(halfEdgeIndex: number): MeshHalfEdge {
    return this.halfEdges[halfEdgeIndex]!;
  }

  /**
   * Returns a face by index.
   *
   * @param faceIndex Face index.
   * @returns Face value.
   */
  getFace(faceIndex: number): MeshFace {
    return this.faces[faceIndex]!;
  }

  /**
   * Replaces the half-edge table.
   *
   * @param halfEdges New half-edge array.
   */
  setHalfEdges(halfEdges: MeshHalfEdge[]): void {
    this.halfEdges = halfEdges;
  }

  /**
   * Replaces the face table.
   *
   * @param faces New face array.
   */
  setFaces(faces: MeshFace[]): void {
    this.faces = faces;
  }

  /**
   * Appends a half-edge and returns its index.
   *
   * @param halfEdge Half-edge to store.
   * @returns Index of the stored half-edge.
   */
  appendHalfEdge(halfEdge: MeshHalfEdge): number {
    const index = this.halfEdges.length;
    this.halfEdges.push(halfEdge);
    return index;
  }

  /**
   * Appends a face and returns its index.
   *
   * @param face Face to store.
   * @returns Index of the stored face.
   */
  appendFace(face: MeshFace): number {
    const index = this.faces.length;
    this.faces.push(face);
    return index;
  }

  /**
   * Writes a half-edge at an existing index.
   *
   * @param halfEdgeIndex Index to overwrite.
   * @param halfEdge New value.
   */
  writeHalfEdge(halfEdgeIndex: number, halfEdge: MeshHalfEdge): void {
    this.halfEdges[halfEdgeIndex] = halfEdge;
  }

  /**
   * Deep-clones positions, half-edges, and faces.
   *
   * @returns Independent topology.
   */
  clone(): MeshTopology {
    const copy = new MeshTopology();
    copy.setPositions(meshVertexPositionsClone(this.positions));
    copy.setHalfEdges(this.halfEdges.map((edge) => cloneMeshHalfEdge(edge)));
    copy.setFaces(this.faces.map((face) => cloneMeshFace(face)));
    return copy;
  }
}
