import * as THREE from 'three';
import {
  FaceTextureMapping,
  cloneFaceTextureMapping,
  createFaceTextureMappingFromTrs,
  getFaceTextureMappingTrs,
} from './face_texture_mapping.js';
import {
  buildProjectionBasis,
  computeRegionWorldNormal,
  projectWorldPositionToUv,
  resolveProjectionNormal,
} from './planar_uv_projector.js';
import { getTriangleVertexIndices, getVertexPosition } from '../../selection/pick/triangle_geometry_utils.js';

/** Edge coincidence tolerance in world units. */
const EDGE_MATCH_TOLERANCE = 1e-3;
/** Parallel-plane threshold on |nA × nB|². */
const PARALLEL_NORMAL_DET = 1e-8;

/** World-space edge segment used for shared-boundary detection. */
interface WorldEdge {
  a: THREE.Vector3;
  b: THREE.Vector3;
}

/**
 * Builds a destination face mapping so UV coordinates continue from a source
 * face across a shared edge. Destination uses a world-space UV matrix.
 *
 * @param sourceMesh Mesh owning the source region.
 * @param sourceTriangles Source coplanar triangle indices.
 * @param sourceMapping Source UV matrix mapping.
 * @param destMesh Mesh owning the destination region.
 * @param destTriangles Destination coplanar triangle indices.
 * @returns Mapping for the destination region.
 */
export function transferUvMappingAcrossFaces(
  sourceMesh: THREE.Mesh,
  sourceTriangles: number[],
  sourceMapping: FaceTextureMapping,
  destMesh: THREE.Mesh,
  destTriangles: number[],
): FaceTextureMapping {
  sourceMesh.updateMatrixWorld(true);
  destMesh.updateMatrixWorld(true);
  const sourceNormal = computeRegionWorldNormal(sourceMesh, sourceTriangles);
  const destNormal = computeRegionWorldNormal(destMesh, destTriangles);
  const points = resolveAlignmentWorldPoints(
    sourceMesh,
    sourceTriangles,
    sourceNormal,
    destMesh,
    destTriangles,
    destNormal,
  );
  const sourceBasis = buildProjectionBasis(resolveProjectionNormal(sourceNormal, sourceMapping.align ?? 'face'), 0);
  const uvA = projectWorldPositionToUv(points.pointA, sourceBasis, sourceMapping);
  const uvB = projectWorldPositionToUv(points.pointB, sourceBasis, sourceMapping);
  return solveDestinationMapping(destNormal, sourceMapping, points.pointA, points.pointB, uvA, uvB, points.flipU);
}

/**
 * Resolves two world points used to lock UV continuity between faces.
 *
 * @param sourceMesh Source mesh.
 * @param sourceTriangles Source triangles.
 * @param sourceNormal Source world normal.
 * @param destMesh Destination mesh.
 * @param destTriangles Destination triangles.
 * @param destNormal Destination world normal.
 * @returns Alignment points and whether U should flip.
 */
function resolveAlignmentWorldPoints(
  sourceMesh: THREE.Mesh,
  sourceTriangles: number[],
  sourceNormal: THREE.Vector3,
  destMesh: THREE.Mesh,
  destTriangles: number[],
  destNormal: THREE.Vector3,
): { pointA: THREE.Vector3; pointB: THREE.Vector3; flipU: boolean } {
  const shared = findSharedWorldEdge(sourceMesh, sourceTriangles, destMesh, destTriangles);
  if (shared) {
    return {
      pointA: shared.a,
      pointB: shared.b,
      flipU: sourceNormal.dot(destNormal) < 0,
    };
  }
  return buildPlaneAlignmentPoints(sourceMesh, sourceTriangles, sourceNormal, destNormal);
}

/**
 * Finds a world-space edge shared by two face regions.
 *
 * @param sourceMesh Source mesh.
 * @param sourceTriangles Source triangles.
 * @param destMesh Destination mesh.
 * @param destTriangles Destination triangles.
 * @returns Shared edge or null.
 */
function findSharedWorldEdge(
  sourceMesh: THREE.Mesh,
  sourceTriangles: number[],
  destMesh: THREE.Mesh,
  destTriangles: number[],
): WorldEdge | null {
  const sourceEdges = collectWorldEdges(sourceMesh, sourceTriangles);
  const destEdges = collectWorldEdges(destMesh, destTriangles);
  for (const sourceEdge of sourceEdges) {
    for (const destEdge of destEdges) {
      if (edgesMatch(sourceEdge, destEdge)) {
        return { a: sourceEdge.a.clone(), b: sourceEdge.b.clone() };
      }
    }
  }
  return null;
}

/**
 * Collects unique world edges for a triangle set.
 *
 * @param mesh Mesh owner.
 * @param triangles Triangle indices.
 * @returns World edges.
 */
function collectWorldEdges(mesh: THREE.Mesh, triangles: number[]): WorldEdge[] {
  const edges: WorldEdge[] = [];
  const seen = new Set<string>();
  const positions = mesh.geometry.getAttribute('position');
  triangles.forEach((triangleIndex) => {
    const indices = getTriangleVertexIndices(mesh.geometry, triangleIndex);
    for (let corner = 0; corner < 3; corner++) {
      const ia = indices[corner];
      const ib = indices[(corner + 1) % 3];
      const a = getVertexPosition(positions, ia).applyMatrix4(mesh.matrixWorld);
      const b = getVertexPosition(positions, ib).applyMatrix4(mesh.matrixWorld);
      const key = edgeKey(a, b);
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ a, b });
    }
  });
  return edges;
}

/**
 * Stable key for an undirected edge.
 *
 * @param a First point.
 * @param b Second point.
 * @returns String key.
 */
function edgeKey(a: THREE.Vector3, b: THREE.Vector3): string {
  const aKey = `${a.x.toFixed(4)},${a.y.toFixed(4)},${a.z.toFixed(4)}`;
  const bKey = `${b.x.toFixed(4)},${b.y.toFixed(4)},${b.z.toFixed(4)}`;
  return aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
}

/**
 * Returns whether two edges coincide within tolerance.
 *
 * @param a First edge.
 * @param b Second edge.
 * @returns True when matching.
 */
function edgesMatch(a: WorldEdge, b: WorldEdge): boolean {
  const direct = a.a.distanceTo(b.a) < EDGE_MATCH_TOLERANCE && a.b.distanceTo(b.b) < EDGE_MATCH_TOLERANCE;
  const flipped = a.a.distanceTo(b.b) < EDGE_MATCH_TOLERANCE && a.b.distanceTo(b.a) < EDGE_MATCH_TOLERANCE;
  return direct || flipped;
}

/**
 * Builds fallback alignment points when faces share no mesh edge.
 *
 * @param sourceMesh Source mesh.
 * @param sourceTriangles Source triangles.
 * @param sourceNormal Source normal.
 * @param destNormal Destination normal.
 * @returns Alignment points.
 */
function buildPlaneAlignmentPoints(
  sourceMesh: THREE.Mesh,
  sourceTriangles: number[],
  sourceNormal: THREE.Vector3,
  destNormal: THREE.Vector3,
): { pointA: THREE.Vector3; pointB: THREE.Vector3; flipU: boolean } {
  const centroid = averageWorldCentroid(sourceMesh, sourceTriangles);
  const cross = new THREE.Vector3().crossVectors(sourceNormal, destNormal);
  let axis: THREE.Vector3;
  if (cross.lengthSq() < PARALLEL_NORMAL_DET) {
    axis = Math.abs(sourceNormal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    axis.cross(sourceNormal).normalize();
  } else {
    axis = cross.normalize();
  }
  const pointA = centroid.clone().addScaledVector(axis, -0.5);
  const pointB = centroid.clone().addScaledVector(axis, 0.5);
  return { pointA, pointB, flipU: sourceNormal.dot(destNormal) < 0 };
}

/**
 * Averages world positions of triangle vertices.
 *
 * @param mesh Mesh owner.
 * @param triangles Triangle indices.
 * @returns World centroid.
 */
function averageWorldCentroid(mesh: THREE.Mesh, triangles: number[]): THREE.Vector3 {
  const accumulator = new THREE.Vector3();
  const positions = mesh.geometry.getAttribute('position');
  let count = 0;
  triangles.forEach((triangleIndex) => {
    const indices = getTriangleVertexIndices(mesh.geometry, triangleIndex);
    indices.forEach((vertexIndex) => {
      accumulator.add(getVertexPosition(positions, vertexIndex).applyMatrix4(mesh.matrixWorld));
      count += 1;
    });
  });
  if (count === 0) return new THREE.Vector3();
  return accumulator.multiplyScalar(1 / count);
}

/**
 * Solves destination mapping using TRS on the dest face plane, then stores a
 * SurfaceUvMatrix (classic continuous-smear solve).
 *
 * @param destNormal Destination face normal.
 * @param sourceMapping Source mapping.
 * @param pointA First world alignment point.
 * @param pointB Second world alignment point.
 * @param uvA Source UV at A.
 * @param uvB Source UV at B.
 * @param flipU Whether to mirror U.
 * @returns Destination mapping.
 */
function solveDestinationMapping(
  destNormal: THREE.Vector3,
  sourceMapping: FaceTextureMapping,
  pointA: THREE.Vector3,
  pointB: THREE.Vector3,
  uvA: { u: number; v: number },
  uvB: { u: number; v: number },
  flipU: boolean,
): FaceTextureMapping {
  const sourceTrs = getFaceTextureMappingTrs(sourceMapping, destNormal);
  const scaleU = flipU ? -Math.abs(sourceTrs.scaleU) : Math.abs(sourceTrs.scaleU);
  const scaleV = Math.abs(sourceTrs.scaleV);
  const projectionNormal = resolveProjectionNormal(destNormal, 'face');
  let mapping = createFaceTextureMappingFromTrs(
    sourceMapping.textureId,
    projectionNormal,
    { scaleU, scaleV, offsetU: 0, offsetV: 0, rotationDeg: 0 },
    'face',
  );
  mapping = applyOffsetToMatchPoint(mapping, projectionNormal, pointA, uvA);
  const rotationDeg = measureRequiredRotation(mapping, projectionNormal, pointA, pointB, uvA, uvB);
  mapping = createFaceTextureMappingFromTrs(
    sourceMapping.textureId,
    projectionNormal,
    { scaleU, scaleV, offsetU: 0, offsetV: 0, rotationDeg: rotationDeg },
    'face',
  );
  mapping = applyOffsetToMatchPoint(mapping, projectionNormal, pointA, uvA);
  return mapping;
}

/**
 * Sets matrix W so a world point maps to a target UV.
 *
 * @param mapping Mapping to update.
 * @param projectionNormal Projection normal.
 * @param worldPoint World sample.
 * @param targetUv Desired UV.
 * @returns Updated mapping.
 */
function applyOffsetToMatchPoint(
  mapping: FaceTextureMapping,
  projectionNormal: THREE.Vector3,
  worldPoint: THREE.Vector3,
  targetUv: { u: number; v: number },
): FaceTextureMapping {
  const trs = getFaceTextureMappingTrs(mapping, projectionNormal);
  const basis = buildProjectionBasis(projectionNormal, trs.rotationDeg);
  const scaleU = trs.scaleU === 0 ? 1 : trs.scaleU;
  const scaleV = trs.scaleV === 0 ? 1 : trs.scaleV;
  const offsetU = worldPoint.dot(basis.uAxis) - targetUv.u * scaleU;
  const offsetV = worldPoint.dot(basis.vAxis) - targetUv.v * scaleV;
  return createFaceTextureMappingFromTrs(
    mapping.textureId,
    projectionNormal,
    { scaleU, scaleV, offsetU, offsetV, rotationDeg: trs.rotationDeg },
    'face',
  );
}

/**
 * Measures rotation so pointB UV direction matches the source.
 *
 * @param mapping Current dest mapping.
 * @param projectionNormal Dest projection normal.
 * @param pointA First world point.
 * @param pointB Second world point.
 * @param uvA Source UV at A.
 * @param uvB Source UV at B.
 * @returns Rotation degrees around the normal.
 */
function measureRequiredRotation(
  mapping: FaceTextureMapping,
  projectionNormal: THREE.Vector3,
  pointA: THREE.Vector3,
  pointB: THREE.Vector3,
  uvA: { u: number; v: number },
  uvB: { u: number; v: number },
): number {
  const trs = getFaceTextureMappingTrs(mapping, projectionNormal);
  const basis = buildProjectionBasis(projectionNormal, trs.rotationDeg);
  const destA = projectWorldPositionToUv(pointA, basis, mapping);
  const destB = projectWorldPositionToUv(pointB, basis, mapping);
  const destDir = new THREE.Vector2(destB.u - destA.u, destB.v - destA.v);
  const sourceDir = new THREE.Vector2(uvB.u - uvA.u, uvB.v - uvA.v);
  if (destDir.lengthSq() < 1e-12 || sourceDir.lengthSq() < 1e-12) {
    return 0;
  }
  destDir.normalize();
  sourceDir.normalize();
  const angleRad = Math.atan2(
    destDir.x * sourceDir.y - destDir.y * sourceDir.x,
    destDir.x * sourceDir.x + destDir.y * sourceDir.y,
  );
  let angleDeg = -THREE.MathUtils.radToDeg(angleRad);
  if (trs.scaleU < 0 !== trs.scaleV < 0) {
    angleDeg = -angleDeg;
  }
  return angleDeg;
}

/**
 * Clones a mapping for use as a smear source seed.
 *
 * @param mapping Source mapping.
 * @returns Independent copy.
 */
export function cloneSmearSourceMapping(mapping: FaceTextureMapping): FaceTextureMapping {
  return cloneFaceTextureMapping(mapping);
}
