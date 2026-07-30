import * as THREE from 'three';
import { TriangleBvh } from './triangle_bvh.js';
import { getTriangleCount } from './utils_triangle_geometry.js';

/** UserData key storing a cached triangle BVH for face picking. */
const FACE_PICK_BVH_USERDATA_KEY = 'facePickTriangleBvh';

/**
 * UserData key for an explicit geometry generation counter. Bumped only when
 * solid/result buffers rewrite positions — not when needsUpdate is set for GPU
 * upload (which would thrash the BVH cache every frame).
 */
export const FACE_PICK_GEOMETRY_GENERATION_KEY = 'facePickGeometryGeneration';

/** Cached BVH entry tied to a geometry content stamp. */
interface FacePickBvhCache {
  stamp: string;
  bvh: TriangleBvh;
}

/**
 * Returns a triangle BVH for face picking, rebuilding only when geometry
 * content identity changes (not on BufferAttribute.needsUpdate).
 *
 * @param mesh Mesh whose geometry is picked.
 * @returns Cached or freshly built BVH, or null when the mesh has no triangles.
 */
export function getOrBuildFacePickBvh(mesh: THREE.Mesh): TriangleBvh | null {
  const geometry = mesh.geometry;
  if (!geometry) return null;
  if (getTriangleCount(geometry) === 0) return null;
  const stamp = buildGeometryPickStamp(geometry);
  const existing = geometry.userData[FACE_PICK_BVH_USERDATA_KEY] as FacePickBvhCache | undefined;
  if (existing && existing.stamp === stamp) {
    return existing.bvh;
  }
  const bvh = new TriangleBvh(geometry);
  geometry.userData[FACE_PICK_BVH_USERDATA_KEY] = { stamp, bvh } satisfies FacePickBvhCache;
  return bvh;
}

/**
 * Builds a stamp that changes when triangle buffers are replaced, reordered, or
 * when the solid pipeline bumps the face-pick generation. Deliberately ignores
 * BufferAttribute.version so GPU dirty flags do not force BVH rebuilds, but
 * fingerprints index contents so material-sort reorders invalidate the BVH even
 * when BufferAttribute.uuid is unavailable.
 *
 * @param geometry Buffer geometry to stamp.
 * @returns Stable string for cache invalidation.
 */
export function buildGeometryPickStamp(geometry: THREE.BufferGeometry): string {
  const positions = geometry.getAttribute('position');
  const index = geometry.index;
  const generation = geometry.userData[FACE_PICK_GEOMETRY_GENERATION_KEY] ?? 0;
  const positionStamp = positions ? `${readAttributeIdentity(positions)}:${positions.count}` : 'none';
  const indexStamp = index
    ? `${readAttributeIdentity(index)}:${index.count}:${fingerprintIndexContents(index)}`
    : 'none';
  return `${geometry.uuid}:${positionStamp}:${indexStamp}:${generation}`;
}

/**
 * Cheap content fingerprint for an index buffer so triangle reorders are
 * detected without hashing every element.
 *
 * @param index Geometry index attribute.
 * @returns Fingerprint string.
 */
function fingerprintIndexContents(index: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): string {
  const array = index.array as ArrayLike<number>;
  const length = array.length;
  if (length === 0) return '0';
  let hash = length;
  const step = Math.max(1, Math.floor(length / 16));
  for (let i = 0; i < length; i += step) {
    hash = (hash * 31 + (array[i]! | 0)) | 0;
  }
  hash = (hash * 31 + (array[length - 1]! | 0)) | 0;
  hash = (hash * 31 + (array[Math.floor(length / 2)]! | 0)) | 0;
  return String(hash);
}

/**
 * Marks geometry content as changed for face picking (invalidates BVH cache).
 * Call after solid result uploads rewrite vertex positions.
 *
 * @param geometry Geometry that received new triangle data.
 */
export function invalidateFacePickAcceleration(geometry: THREE.BufferGeometry): void {
  const previous = geometry.userData[FACE_PICK_GEOMETRY_GENERATION_KEY];
  geometry.userData[FACE_PICK_GEOMETRY_GENERATION_KEY] = typeof previous === 'number' ? previous + 1 : 1;
  clearFacePickBvhCache(geometry);
}

/**
 * Clears a cached face-pick BVH from geometry userData.
 *
 * @param geometry Geometry that may hold a BVH cache entry.
 */
export function clearFacePickBvhCache(geometry: THREE.BufferGeometry): void {
  delete geometry.userData[FACE_PICK_BVH_USERDATA_KEY];
}

/**
 * Returns a stable identity for a buffer attribute without using .version.
 *
 * @param attribute Position or index attribute.
 * @returns Uuid when present, otherwise a weak array identity.
 */
function readAttributeIdentity(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): string {
  const withUuid = attribute as { uuid?: string; array?: ArrayLike<number> };
  if (typeof withUuid.uuid === 'string' && withUuid.uuid.length > 0) {
    return withUuid.uuid;
  }
  if (withUuid.array) {
    return `arr:${withUuid.array.length}`;
  }
  return 'attr';
}
