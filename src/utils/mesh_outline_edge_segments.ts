import * as THREE from 'three';
import { readPersistentMeshDocument } from '@/mesh/document/mesh_document_binding.js';
import {
  meshTopologyFaceHalfEdgeIndices,
  meshTopologyHalfEdgeCornerVertex,
  meshTopologyHalfEdgeDestinationVertex,
} from '@/mesh/topology/mesh_topology_query.js';
import { buildGeometryPickStamp } from '@/selection/pick/mesh_pick_acceleration.js';

/**
 * Angle threshold matching content decorative edges and solid brush wireframes.
 * Coplanar triangulation diagonals stay soft and are excluded.
 */
export const MESH_OUTLINE_EDGE_ANGLE_THRESHOLD_DEGREES = 1;

/** UserData cache for packed local outline edge segments. */
const OUTLINE_EDGE_SEGMENT_CACHE_USERDATA_KEY = 'meshOutlineEdgeSegmentCache';

/** Cached local-space outline segments tied to a geometry content stamp. */
interface OutlineEdgeSegmentCache {
  stamp: string;
  /** Flat xyz pairs: ax, ay, az, bx, by, bz, … in mesh-local space. */
  localPositions: Float32Array;
}

/**
 * Returns packed local-space outline edge segments for a mesh. Prefers
 * persistent n-gon MeshDocument topology when present; otherwise uses hard
 * edges from {@link THREE.EdgesGeometry} (same threshold as brush/content
 * wireframes). Results are cached on the BufferGeometry.
 *
 * @param mesh Mesh to extract outline edges from.
 * @returns Flat local positions for edge segment pairs, or null when empty.
 */
export function getOrBuildMeshOutlineEdgeLocalPositions(mesh: THREE.Mesh): Float32Array | null {
  const geometry = mesh.geometry;
  if (!geometry) {
    return null;
  }
  const stamp = buildOutlineEdgeCacheStamp(mesh);
  const existing = geometry.userData[OUTLINE_EDGE_SEGMENT_CACHE_USERDATA_KEY] as OutlineEdgeSegmentCache | undefined;
  if (existing && existing.stamp === stamp) {
    return existing.localPositions.length > 0 ? existing.localPositions : null;
  }
  const localPositions = buildMeshOutlineEdgeLocalPositions(mesh);
  geometry.userData[OUTLINE_EDGE_SEGMENT_CACHE_USERDATA_KEY] = {
    stamp,
    localPositions,
  } satisfies OutlineEdgeSegmentCache;
  return localPositions.length > 0 ? localPositions : null;
}

/**
 * Builds a cache stamp that invalidates when geometry or n-gon document
 * changes.
 *
 * @param mesh Mesh being cached.
 * @returns Stamp string.
 */
function buildOutlineEdgeCacheStamp(mesh: THREE.Mesh): string {
  const geometryStamp = buildGeometryPickStamp(mesh.geometry);
  const document = readPersistentMeshDocument(mesh);
  if (!document) {
    return geometryStamp;
  }
  return `${geometryStamp}|docGen:${document.getGeometryGeneration()}`;
}

/**
 * Builds local outline edge positions for a mesh without reading the cache.
 *
 * @param mesh Source mesh.
 * @returns Flat local segment positions.
 */
function buildMeshOutlineEdgeLocalPositions(mesh: THREE.Mesh): Float32Array {
  const fromDocument = buildOutlineEdgesFromMeshDocument(mesh);
  if (fromDocument) {
    return fromDocument;
  }
  return buildOutlineEdgesFromHardEdgesGeometry(mesh.geometry);
}

/**
 * Extracts undirected n-gon boundary edges from a persistent MeshDocument.
 *
 * @param mesh Mesh that may carry a MeshDocument.
 * @returns Local positions, or null when no document is bound.
 */
function buildOutlineEdgesFromMeshDocument(mesh: THREE.Mesh): Float32Array | null {
  const document = readPersistentMeshDocument(mesh);
  if (!document) {
    return null;
  }
  const topology = document.getTopology();
  const positions = topology.getPositions();
  const seen = new Set<string>();
  const segments: number[] = [];
  const faceCount = topology.getFaceCount();
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    for (const halfEdgeIndex of meshTopologyFaceHalfEdgeIndices(topology, faceIndex)) {
      const a = meshTopologyHalfEdgeCornerVertex(topology, halfEdgeIndex);
      const b = meshTopologyHalfEdgeDestinationVertex(topology, halfEdgeIndex);
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      appendLocalVertex(segments, positions, a);
      appendLocalVertex(segments, positions, b);
    }
  }
  return new Float32Array(segments);
}

/**
 * Appends one packed vertex into a growable segment list.
 *
 * @param segments Growable xyz list.
 * @param positions Packed topology positions.
 * @param vertexIndex Vertex index.
 */
function appendLocalVertex(segments: number[], positions: Float32Array, vertexIndex: number): void {
  const base = vertexIndex * 3;
  segments.push(positions[base]!, positions[base + 1]!, positions[base + 2]!);
}

/**
 * Builds outline edges from hard-edge extraction of triangulated GPU geometry.
 *
 * @param geometry Mesh buffer geometry.
 * @returns Flat local segment positions.
 */
function buildOutlineEdgesFromHardEdgesGeometry(geometry: THREE.BufferGeometry): Float32Array {
  const edgesGeometry = new THREE.EdgesGeometry(geometry, MESH_OUTLINE_EDGE_ANGLE_THRESHOLD_DEGREES);
  const position = edgesGeometry.getAttribute('position');
  if (!(position instanceof THREE.BufferAttribute) || position.count < 2) {
    edgesGeometry.dispose();
    return new Float32Array(0);
  }
  const localPositions = new Float32Array(position.array as ArrayLike<number>);
  edgesGeometry.dispose();
  return localPositions;
}

/**
 * Iterates local outline edge segments as endpoint pairs.
 *
 * @param localPositions Packed local segment positions.
 * @param visitor Called once per edge with local endpoints.
 */
export function forEachMeshOutlineEdgeLocalSegment(
  localPositions: Float32Array,
  visitor: (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => void,
): void {
  const segmentCount = Math.floor(localPositions.length / 6);
  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex++) {
    const base = segmentIndex * 6;
    visitor(
      localPositions[base]!,
      localPositions[base + 1]!,
      localPositions[base + 2]!,
      localPositions[base + 3]!,
      localPositions[base + 4]!,
      localPositions[base + 5]!,
    );
  }
}
