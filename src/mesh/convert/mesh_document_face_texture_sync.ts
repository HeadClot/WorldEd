import * as THREE from 'three';
import type { MeshDocument } from '@/mesh/document/mesh_document.js';
import {
  meshTopologyFaceHalfEdgeIndices,
  meshTopologyHalfEdgeCornerVertex,
} from '@/mesh/topology/mesh_topology_query.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import { createDefaultFaceTextureMapping } from '@/texture/uv/face_texture_mapping.js';
import { getFaceTextureMapsLive, setFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import { meshDocumentFaceIndexFromDisplayTriangle } from './mesh_document_face_triangle_map.js';

/** Position match epsilon when mapping display triangles onto document faces. */
const FACE_VERTEX_MATCH_EPSILON = 1e-4;

/**
 * Copies per-triangle display textures onto document face surfaces so edit
 * rebuilds can restore multi-material groups after geometry replacement.
 *
 * @param mesh Display mesh with optional faceTextureMaps.
 * @param document Editable mesh document.
 */
export function captureMeshDocumentFaceTexturesFromDisplay(mesh: THREE.Mesh, document: MeshDocument): void {
  if (documentHasAnyFaceTexture(document)) {
    return;
  }
  const triangleCount = countGeometryTriangles(mesh.geometry);
  if (triangleCount === 0) {
    return;
  }
  const textureByTriangle = buildPerTriangleTextureIds(mesh, triangleCount);
  const multiMaterialDisplay = Array.isArray(mesh.material);
  if (!multiMaterialDisplay && assignTexturesByDocumentTriangleOrder(document, textureByTriangle)) {
    return;
  }
  assignTexturesByVertexPositionMatch(mesh, document, textureByTriangle);
}

/**
 * Rebuilds faceTextureMaps from document face surfaces using document-order
 * display triangulation (same expansion as meshDocumentToBufferGeometry).
 *
 * @param mesh Display mesh receiving maps.
 * @param document Source mesh document.
 */
export function writeFaceTextureMapsFromMeshDocument(mesh: THREE.Mesh, document: MeshDocument): void {
  const entries = buildFaceTextureMapEntriesFromDocument(document);
  setFaceTextureMaps(mesh, entries);
}

/**
 * Returns the texture id stored on a document face surface, or the default.
 *
 * @param document Mesh document.
 * @param faceIndex Face index.
 * @returns Texture identity string.
 */
export function readMeshDocumentFaceTextureId(document: MeshDocument, faceIndex: number): string {
  const surface = document.getAttributes().getFaceSurfaces().get(faceIndex);
  if (!surface || !surface.textureId) {
    return DEFAULT_CHECKER_TEXTURE_ID;
  }
  return surface.textureId;
}

/**
 * Writes a texture id onto a document face surface, preserving UV matrix when
 * present.
 *
 * @param document Mesh document.
 * @param faceIndex Face index.
 * @param textureId Texture identity.
 */
export function writeMeshDocumentFaceTextureId(document: MeshDocument, faceIndex: number, textureId: string): void {
  const surfaces = document.getAttributes().getFaceSurfaces();
  const existing = surfaces.get(faceIndex);
  surfaces.set(faceIndex, {
    textureId: textureId || DEFAULT_CHECKER_TEXTURE_ID,
    uv: existing?.uv.clone() ?? SurfaceUvMatrix.identity(),
  });
}

/**
 * Returns whether any document face already stores an authored face surface.
 *
 * @param document Mesh document.
 * @returns True when at least one face surface slot is present.
 */
function documentHasAnyFaceTexture(document: MeshDocument): boolean {
  const surfaces = document.getAttributes().getFaceSurfaces();
  const faceCount = document.getTopology().getFaceCount();
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    if (surfaces.get(faceIndex)) {
      return true;
    }
  }
  return false;
}

/**
 * Assigns textures assuming display triangle order matches document expansion.
 *
 * @param document Mesh document.
 * @param textureByTriangle Texture id per display triangle.
 * @returns True when every face received a texture this way.
 */
function assignTexturesByDocumentTriangleOrder(document: MeshDocument, textureByTriangle: readonly string[]): boolean {
  const faceCount = document.getTopology().getFaceCount();
  let displayTriangle = 0;
  let assignedAny = false;
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    const triangleCount = Math.max(0, meshTopologyFaceHalfEdgeIndices(document.getTopology(), faceIndex).length - 2);
    if (triangleCount === 0) {
      continue;
    }
    if (displayTriangle + triangleCount > textureByTriangle.length) {
      return false;
    }
    const textureId = textureByTriangle[displayTriangle] ?? DEFAULT_CHECKER_TEXTURE_ID;
    writeMeshDocumentFaceTextureId(document, faceIndex, textureId);
    assignedAny = true;
    displayTriangle += triangleCount;
  }
  return assignedAny && displayTriangle === textureByTriangle.length;
}

/**
 * Assigns textures by matching display triangle corners to document faces.
 *
 * @param mesh Display mesh.
 * @param document Mesh document.
 * @param textureByTriangle Texture id per display triangle.
 */
function assignTexturesByVertexPositionMatch(
  mesh: THREE.Mesh,
  document: MeshDocument,
  textureByTriangle: readonly string[],
): void {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute('position');
  if (!position) {
    return;
  }
  const votes = collectFaceTextureVotes(geometry, position, document, textureByTriangle);
  applyFaceTextureVotes(document, votes);
}

/**
 * Collects face texture votes from display triangles.
 *
 * @param geometry Display geometry.
 * @param position Position attribute.
 * @param document Mesh document.
 * @param textureByTriangle Texture id per display triangle.
 * @returns Face → texture → count votes.
 */
function collectFaceTextureVotes(
  geometry: THREE.BufferGeometry,
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  document: MeshDocument,
  textureByTriangle: readonly string[],
): Map<number, Map<string, number>> {
  const votes = new Map<number, Map<string, number>>();
  for (let triangleIndex = 0; triangleIndex < textureByTriangle.length; triangleIndex++) {
    voteOneTriangleTexture(geometry, position, document, textureByTriangle, triangleIndex, votes);
  }
  return votes;
}

/**
 * Votes one display triangle's texture onto a matching document face.
 *
 * @param geometry Display geometry.
 * @param position Position attribute.
 * @param document Mesh document.
 * @param textureByTriangle Texture id per display triangle.
 * @param triangleIndex Display triangle index.
 * @param votes Accumulator.
 */
function voteOneTriangleTexture(
  geometry: THREE.BufferGeometry,
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  document: MeshDocument,
  textureByTriangle: readonly string[],
  triangleIndex: number,
  votes: Map<number, Map<string, number>>,
): void {
  const corners = readTriangleCornerPositions(geometry, position, triangleIndex);
  if (!corners) {
    return;
  }
  const faceIndex =
    findDocumentFaceForTriangleCorners(document, corners) ??
    meshDocumentFaceIndexFromDisplayTriangle(document, triangleIndex);
  if (faceIndex === null) {
    return;
  }
  tallyFaceTextureVote(votes, faceIndex, textureByTriangle[triangleIndex]!);
}

/**
 * Writes majority texture votes onto document face surfaces.
 *
 * @param document Mesh document.
 * @param votes Face → texture → count.
 */
function applyFaceTextureVotes(document: MeshDocument, votes: Map<number, Map<string, number>>): void {
  for (const [faceIndex, textureVotes] of votes) {
    writeMeshDocumentFaceTextureId(document, faceIndex, pickMajorityTexture(textureVotes));
  }
}

/**
 * Tallies one texture vote for a face.
 *
 * @param votes Face → texture → count.
 * @param faceIndex Face index.
 * @param textureId Texture identity.
 */
function tallyFaceTextureVote(votes: Map<number, Map<string, number>>, faceIndex: number, textureId: string): void {
  const id = textureId || DEFAULT_CHECKER_TEXTURE_ID;
  let faceVotes = votes.get(faceIndex);
  if (!faceVotes) {
    faceVotes = new Map();
    votes.set(faceIndex, faceVotes);
  }
  faceVotes.set(id, (faceVotes.get(id) ?? 0) + 1);
}

/**
 * Picks the texture with the highest vote count.
 *
 * @param textureVotes Texture → count.
 * @returns Winning texture id.
 */
function pickMajorityTexture(textureVotes: Map<string, number>): string {
  let bestId = DEFAULT_CHECKER_TEXTURE_ID;
  let bestCount = -1;
  for (const [textureId, count] of textureVotes) {
    if (count > bestCount) {
      bestCount = count;
      bestId = textureId;
    }
  }
  return bestId;
}

/**
 * Finds a document face whose vertex positions cover all triangle corners.
 *
 * @param document Mesh document.
 * @param corners Triangle corner positions.
 * @returns Face index or null.
 */
function findDocumentFaceForTriangleCorners(document: MeshDocument, corners: readonly THREE.Vector3[]): number | null {
  const topology = document.getTopology();
  const positions = topology.getPositions();
  const faceCount = topology.getFaceCount();
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    if (documentFaceContainsCorners(topology, positions, faceIndex, corners)) {
      return faceIndex;
    }
  }
  return null;
}

/**
 * Returns whether every triangle corner matches a vertex on the face.
 *
 * @param topology Mesh topology.
 * @param positions Packed positions.
 * @param faceIndex Face index.
 * @param corners Triangle corners.
 * @returns True when all corners match face vertices.
 */
function documentFaceContainsCorners(
  topology: import('@/mesh/topology/mesh_topology.js').MeshTopology,
  positions: Float32Array,
  faceIndex: number,
  corners: readonly THREE.Vector3[],
): boolean {
  const facePoints: THREE.Vector3[] = [];
  for (const halfEdgeIndex of meshTopologyFaceHalfEdgeIndices(topology, faceIndex)) {
    const vertexIndex = meshTopologyHalfEdgeCornerVertex(topology, halfEdgeIndex);
    const base = vertexIndex * 3;
    facePoints.push(new THREE.Vector3(positions[base] ?? 0, positions[base + 1] ?? 0, positions[base + 2] ?? 0));
  }
  for (const corner of corners) {
    if (!facePoints.some((point) => point.distanceToSquared(corner) <= FACE_VERTEX_MATCH_EPSILON ** 2)) {
      return false;
    }
  }
  return true;
}

/**
 * Reads three corner positions for a display triangle.
 *
 * @param geometry Buffer geometry.
 * @param position Position attribute.
 * @param triangleIndex Triangle index.
 * @returns Corner positions or null.
 */
function readTriangleCornerPositions(
  geometry: THREE.BufferGeometry,
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  triangleIndex: number,
): THREE.Vector3[] | null {
  const index = geometry.getIndex();
  const corners: THREE.Vector3[] = [];
  for (let corner = 0; corner < 3; corner++) {
    const vertexIndex = index ? index.getX(triangleIndex * 3 + corner) : triangleIndex * 3 + corner;
    if (vertexIndex < 0 || vertexIndex >= position.count) {
      return null;
    }
    corners.push(new THREE.Vector3(position.getX(vertexIndex), position.getY(vertexIndex), position.getZ(vertexIndex)));
  }
  return corners;
}

/**
 * Builds faceTextureMaps entries from document face textures in expansion
 * order.
 *
 * @param document Mesh document.
 * @returns Face texture map entries.
 */
function buildFaceTextureMapEntriesFromDocument(
  document: MeshDocument,
): Array<{ triangleIndices: number[]; mapping: ReturnType<typeof createDefaultFaceTextureMapping> }> {
  const byTexture = collectDisplayTrianglesByTexture(document);
  return mapTextureBucketsToFaceMapEntries(byTexture);
}

/**
 * Groups document-order display triangle indices by face texture id.
 *
 * @param document Mesh document.
 * @returns Texture id → triangle index list.
 */
function collectDisplayTrianglesByTexture(document: MeshDocument): Map<string, number[]> {
  const byTexture = new Map<string, number[]>();
  let displayTriangle = 0;
  const topology = document.getTopology();
  const faceCount = topology.getFaceCount();
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    const triangleCount = Math.max(0, meshTopologyFaceHalfEdgeIndices(topology, faceIndex).length - 2);
    appendFaceTrianglesForTexture(
      byTexture,
      readMeshDocumentFaceTextureId(document, faceIndex),
      displayTriangle,
      triangleCount,
    );
    displayTriangle += triangleCount;
  }
  return byTexture;
}

/**
 * Appends a contiguous display triangle range under one texture id.
 *
 * @param byTexture Texture buckets.
 * @param textureId Texture identity.
 * @param displayTriangleStart First display triangle index.
 * @param triangleCount Triangle count for the face.
 */
function appendFaceTrianglesForTexture(
  byTexture: Map<string, number[]>,
  textureId: string,
  displayTriangleStart: number,
  triangleCount: number,
): void {
  let list = byTexture.get(textureId);
  if (!list) {
    list = [];
    byTexture.set(textureId, list);
  }
  for (let offset = 0; offset < triangleCount; offset++) {
    list.push(displayTriangleStart + offset);
  }
}

/**
 * Converts texture triangle buckets into faceTextureMaps entries.
 *
 * @param byTexture Texture id → triangle indices.
 * @returns Face texture map entries.
 */
function mapTextureBucketsToFaceMapEntries(
  byTexture: Map<string, number[]>,
): Array<{ triangleIndices: number[]; mapping: ReturnType<typeof createDefaultFaceTextureMapping> }> {
  const entries: Array<{
    triangleIndices: number[];
    mapping: ReturnType<typeof createDefaultFaceTextureMapping>;
  }> = [];
  for (const [textureId, triangleIndices] of byTexture) {
    if (triangleIndices.length === 0) {
      continue;
    }
    entries.push({
      triangleIndices: triangleIndices.slice().sort((a, b) => a - b),
      mapping: createDefaultFaceTextureMapping(textureId),
    });
  }
  return entries;
}

/**
 * Builds per-triangle texture ids from mesh face maps.
 *
 * @param mesh Content mesh.
 * @param triangleCount Triangle count.
 * @returns Texture id per triangle.
 */
function buildPerTriangleTextureIds(mesh: THREE.Mesh, triangleCount: number): string[] {
  const ids = new Array<string>(triangleCount).fill(DEFAULT_CHECKER_TEXTURE_ID);
  for (const entry of getFaceTextureMapsLive(mesh)) {
    const textureId = entry.mapping.textureId || DEFAULT_CHECKER_TEXTURE_ID;
    for (const triangleIndex of entry.triangleIndices) {
      if (triangleIndex >= 0 && triangleIndex < triangleCount) {
        ids[triangleIndex] = textureId;
      }
    }
  }
  return ids;
}

/**
 * Counts triangles in a buffer geometry.
 *
 * @param geometry Buffer geometry.
 * @returns Triangle count.
 */
function countGeometryTriangles(geometry: THREE.BufferGeometry): number {
  const index = geometry.getIndex();
  if (index) {
    return Math.floor(index.count / 3);
  }
  const position = geometry.getAttribute('position');
  if (!position) {
    return 0;
  }
  return Math.floor(position.count / 3);
}
