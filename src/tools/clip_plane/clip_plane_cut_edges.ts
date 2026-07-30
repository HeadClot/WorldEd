import * as THREE from 'three';
import { getTriangleCount, getTriangleVertexIndices } from '@/selection/pick/utils_triangle_geometry.js';

/** Epsilon for plane side classification and coplanar edges. */
const CUT_EDGE_EPSILON = 1e-5;

/** Reused vectors so interactive drags do not thrash the allocator. */
const scratchLocalPlane = new THREE.Plane();
const scratchInverseMatrix = new THREE.Matrix4();
const scratchBox = new THREE.Box3();
const scratchCenter = new THREE.Vector3();
const scratchHalfSize = new THREE.Vector3();
const scratchV0 = new THREE.Vector3();
const scratchV1 = new THREE.Vector3();
const scratchV2 = new THREE.Vector3();
const scratchWorldA = new THREE.Vector3();
const scratchWorldB = new THREE.Vector3();
const scratchHitA = new THREE.Vector3();
const scratchHitB = new THREE.Vector3();

/**
 * Collects world-space line segments where a clip plane cuts target meshes.
 * Only the provided meshes are considered (selection / clip targets — never the
 * whole scene). Meshes whose world AABB misses the plane are skipped.
 *
 * @param plane World-space clip plane.
 * @param meshes Candidate clip targets (selected brushes/meshes only).
 * @returns Interleaved segment endpoints [a0,b0,a1,b1,...] in world space.
 */
export function collectClipCutEdgeSegments(plane: THREE.Plane, meshes: readonly THREE.Mesh[]): THREE.Vector3[] {
  const segments: THREE.Vector3[] = [];
  for (let meshIndex = 0; meshIndex < meshes.length; meshIndex++) {
    appendMeshCutSegments(plane, meshes[meshIndex]!, segments);
  }
  return segments;
}

/**
 * Appends plane∩triangle cut segments for one mesh into the shared list.
 *
 * @param plane World-space clip plane.
 * @param mesh Mesh to test.
 * @param segments Output list of endpoint pairs.
 */
function appendMeshCutSegments(plane: THREE.Plane, mesh: THREE.Mesh, segments: THREE.Vector3[]): void {
  const geometry = mesh.geometry;
  if (!(geometry instanceof THREE.BufferGeometry)) return;
  const positions = geometry.getAttribute('position');
  if (!positions) return;
  mesh.updateMatrixWorld(true);
  if (!doesPlaneIntersectWorldBounds(plane, mesh)) return;
  scratchInverseMatrix.copy(mesh.matrixWorld).invert();
  scratchLocalPlane.copy(plane).applyMatrix4(scratchInverseMatrix);
  const triangleCount = getTriangleCount(geometry);
  for (let faceIndex = 0; faceIndex < triangleCount; faceIndex++) {
    appendTriangleCutSegment(geometry, positions, faceIndex, mesh.matrixWorld, segments);
  }
}

/**
 * Rejects meshes whose world AABB does not intersect the clip plane.
 *
 * @param plane World clip plane.
 * @param mesh Mesh with a world matrix.
 * @returns True when the plane may cut the mesh bounds.
 */
function doesPlaneIntersectWorldBounds(plane: THREE.Plane, mesh: THREE.Mesh): boolean {
  if (!mesh.geometry.boundingBox) {
    mesh.geometry.computeBoundingBox();
  }
  const localBox = mesh.geometry.boundingBox;
  if (!localBox) return true;
  scratchBox.copy(localBox).applyMatrix4(mesh.matrixWorld);
  scratchBox.getCenter(scratchCenter);
  scratchBox.getSize(scratchHalfSize).multiplyScalar(0.5);
  const radius =
    scratchHalfSize.x * Math.abs(plane.normal.x) +
    scratchHalfSize.y * Math.abs(plane.normal.y) +
    scratchHalfSize.z * Math.abs(plane.normal.z);
  return Math.abs(plane.distanceToPoint(scratchCenter)) <= radius + CUT_EDGE_EPSILON;
}

/**
 * Emits at most one world-space segment for a triangle that straddles the
 * plane.
 *
 * @param geometry Mesh geometry.
 * @param positions Position attribute.
 * @param faceIndex Triangle index.
 * @param matrixWorld Mesh world matrix.
 * @param segments Output endpoint list.
 */
function appendTriangleCutSegment(
  geometry: THREE.BufferGeometry,
  positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  faceIndex: number,
  matrixWorld: THREE.Matrix4,
  segments: THREE.Vector3[],
): void {
  const [i0, i1, i2] = getTriangleVertexIndices(geometry, faceIndex);
  scratchV0.fromBufferAttribute(positions, i0);
  scratchV1.fromBufferAttribute(positions, i1);
  scratchV2.fromBufferAttribute(positions, i2);
  const d0 = scratchLocalPlane.distanceToPoint(scratchV0);
  const d1 = scratchLocalPlane.distanceToPoint(scratchV1);
  const d2 = scratchLocalPlane.distanceToPoint(scratchV2);
  const hitCount = collectTrianglePlaneHits(d0, d1, d2);
  if (hitCount < 2) return;
  scratchWorldA.copy(scratchHitA).applyMatrix4(matrixWorld);
  scratchWorldB.copy(scratchHitB).applyMatrix4(matrixWorld);
  if (scratchWorldA.distanceToSquared(scratchWorldB) < CUT_EDGE_EPSILON * CUT_EDGE_EPSILON) return;
  segments.push(scratchWorldA.clone(), scratchWorldB.clone());
}

/**
 * Fills scratchHitA/B with local intersection points on triangle edges.
 *
 * @param d0 Signed distance of vertex 0.
 * @param d1 Signed distance of vertex 1.
 * @param d2 Signed distance of vertex 2.
 * @returns Number of intersection points written (0–2).
 */
function collectTrianglePlaneHits(d0: number, d1: number, d2: number): number {
  let hitCount = 0;
  hitCount = tryEdgeHit(scratchV0, scratchV1, d0, d1, hitCount);
  hitCount = tryEdgeHit(scratchV1, scratchV2, d1, d2, hitCount);
  hitCount = tryEdgeHit(scratchV2, scratchV0, d2, d0, hitCount);
  return hitCount;
}

/**
 * Records an edge∩plane hit into scratchHitA then scratchHitB.
 *
 * @param a Edge start (local).
 * @param b Edge end (local).
 * @param distanceA Signed distance at a.
 * @param distanceB Signed distance at b.
 * @param hitCount Hits recorded so far.
 * @returns Updated hit count (capped at 2).
 */
function tryEdgeHit(
  a: THREE.Vector3,
  b: THREE.Vector3,
  distanceA: number,
  distanceB: number,
  hitCount: number,
): number {
  if (hitCount >= 2) return hitCount;
  if (distanceA * distanceB > 0) return hitCount;
  if (Math.abs(distanceA) < CUT_EDGE_EPSILON && Math.abs(distanceB) < CUT_EDGE_EPSILON) {
    return hitCount;
  }
  const denom = distanceA - distanceB;
  if (Math.abs(denom) < CUT_EDGE_EPSILON) return hitCount;
  const t = distanceA / denom;
  if (t < -CUT_EDGE_EPSILON || t > 1 + CUT_EDGE_EPSILON) return hitCount;
  const clampedT = Math.min(1, Math.max(0, t));
  const hit = hitCount === 0 ? scratchHitA : scratchHitB;
  hit.lerpVectors(a, b, clampedT);
  return hitCount + 1;
}
