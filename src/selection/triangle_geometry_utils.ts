import * as THREE from 'three';

/**
 * Returns the three position-attribute vertex indices for a triangle face.
 * Correctly handles both indexed and non-indexed BufferGeometry.
 * @param geometry The buffer geometry to read.
 * @param faceIndex The triangle index (from raycast faceIndex).
 * @returns A tuple of three vertex indices into the position attribute.
 */
export function getTriangleVertexIndices(
  geometry: THREE.BufferGeometry,
  faceIndex: number
): [number, number, number] {
  const indexAttribute = geometry.index;
  if (indexAttribute) {
    const base = faceIndex * 3;
    return [
      indexAttribute.getX(base),
      indexAttribute.getX(base + 1),
      indexAttribute.getX(base + 2)
    ];
  }
  const base = faceIndex * 3;
  return [base, base + 1, base + 2];
}

/**
 * Returns the number of triangles in a buffer geometry.
 * @param geometry The geometry to inspect.
 * @returns Triangle count.
 */
export function getTriangleCount(geometry: THREE.BufferGeometry): number {
  const indexAttribute = geometry.index;
  if (indexAttribute) {
    return Math.floor(indexAttribute.count / 3);
  }
  const positions = geometry.getAttribute('position');
  if (!positions) return 0;
  return Math.floor(positions.count / 3);
}

/**
 * Reads a vertex position from a position attribute.
 * @param positions The position attribute.
 * @param vertexIndex The vertex index.
 * @returns The vertex as a Vector3.
 */
export function getVertexPosition(
  positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  vertexIndex: number
): THREE.Vector3 {
  return new THREE.Vector3(
    positions.getX(vertexIndex),
    positions.getY(vertexIndex),
    positions.getZ(vertexIndex)
  );
}

/**
 * Computes the normal of a triangle face, handling indexed geometry.
 * @param geometry The buffer geometry.
 * @param faceIndex The triangle index.
 * @returns A normalized face normal.
 */
export function computeTriangleNormal(
  geometry: THREE.BufferGeometry,
  faceIndex: number
): THREE.Vector3 {
  const positions = geometry.getAttribute('position');
  const [i0, i1, i2] = getTriangleVertexIndices(geometry, faceIndex);
  const v0 = getVertexPosition(positions, i0);
  const v1 = getVertexPosition(positions, i1);
  const v2 = getVertexPosition(positions, i2);
  const edgeA = new THREE.Vector3().subVectors(v1, v0);
  const edgeB = new THREE.Vector3().subVectors(v2, v0);
  return new THREE.Vector3().crossVectors(edgeA, edgeB).normalize();
}

/**
 * Computes a point on the triangle used as a plane sample (centroid).
 * @param geometry The buffer geometry.
 * @param faceIndex The triangle index.
 * @returns The triangle centroid.
 */
export function computeTriangleCentroid(
  geometry: THREE.BufferGeometry,
  faceIndex: number
): THREE.Vector3 {
  const positions = geometry.getAttribute('position');
  const [i0, i1, i2] = getTriangleVertexIndices(geometry, faceIndex);
  const v0 = getVertexPosition(positions, i0);
  const v1 = getVertexPosition(positions, i1);
  const v2 = getVertexPosition(positions, i2);
  return v0.add(v1).add(v2).multiplyScalar(1 / 3);
}

/**
 * Finds all triangle indices coplanar with a seed triangle.
 * Used so face selection picks whole flat faces (e.g. both tris of a box side).
 * Does not require edge connectivity; prefer findConnectedCoplanarFaceIndices for
 * CSG result meshes where many distant fragments may share a plane.
 * @param geometry The buffer geometry.
 * @param seedFaceIndex The triangle that was clicked.
 * @param normalDotTolerance Minimum |n·seed| for normals to match (default ~5°).
 * @param planeTolerance Max plane distance error for coplanarity.
 * @returns Sorted unique triangle indices including the seed.
 */
export function findCoplanarFaceIndices(
  geometry: THREE.BufferGeometry,
  seedFaceIndex: number,
  normalDotTolerance: number = 0.995,
  planeTolerance: number = 1e-3
): number[] {
  const triangleCount = getTriangleCount(geometry);
  if (seedFaceIndex < 0 || seedFaceIndex >= triangleCount) {
    return [];
  }
  const seedNormal = computeTriangleNormal(geometry, seedFaceIndex);
  const seedPoint = computeTriangleCentroid(geometry, seedFaceIndex);
  const seedPlaneConstant = seedNormal.dot(seedPoint);
  const result: number[] = [];
  for (let faceIndex = 0; faceIndex < triangleCount; faceIndex++) {
    if (!isTriangleCoplanarWithSeed(
      geometry,
      faceIndex,
      seedNormal,
      seedPlaneConstant,
      normalDotTolerance,
      planeTolerance
    )) {
      continue;
    }
    result.push(faceIndex);
  }
  return result;
}

/**
 * Finds the edge-connected coplanar polygon containing the seed triangle.
 * Position-based edge matching works for non-indexed CSG result meshes.
 * @param geometry The buffer geometry.
 * @param seedFaceIndex The triangle that was clicked.
 * @param normalDotTolerance Minimum normal alignment with the seed.
 * @param planeTolerance Max plane distance error for coplanarity.
 * @returns Sorted triangle indices of the connected coplanar region.
 */
export function findConnectedCoplanarFaceIndices(
  geometry: THREE.BufferGeometry,
  seedFaceIndex: number,
  normalDotTolerance: number = 0.995,
  planeTolerance: number = 1e-3
): number[] {
  const coplanar = findCoplanarFaceIndices(
    geometry,
    seedFaceIndex,
    normalDotTolerance,
    planeTolerance
  );
  if (coplanar.length <= 1) return coplanar;
  return floodFillConnectedFaces(geometry, seedFaceIndex, new Set(coplanar));
}

/**
 * Flood-fills face indices among a candidate set using shared position edges.
 * @param geometry Source geometry.
 * @param seedFaceIndex Start triangle (must be in candidates).
 * @param candidates Allowed triangle indices.
 * @returns Sorted connected subset including the seed.
 */
export function floodFillConnectedFaces(
  geometry: THREE.BufferGeometry,
  seedFaceIndex: number,
  candidates: ReadonlySet<number>
): number[] {
  if (!candidates.has(seedFaceIndex)) return [];
  const adjacency = buildPositionEdgeAdjacency(geometry, candidates);
  const visited = new Set<number>();
  const queue = [seedFaceIndex];
  visited.add(seedFaceIndex);
  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = adjacency.get(current);
    if (!neighbors) continue;
    for (const neighbor of neighbors) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      queue.push(neighbor);
    }
  }
  return Array.from(visited).sort((a, b) => a - b);
}

/**
 * Builds undirected triangle adjacency via quantized shared edges.
 * @param geometry Source geometry.
 * @param faceIndices Candidate triangle indices.
 * @returns Map from face index to neighboring face indices.
 */
function buildPositionEdgeAdjacency(
  geometry: THREE.BufferGeometry,
  faceIndices: ReadonlySet<number>
): Map<number, number[]> {
  const edgeToFaces = new Map<string, number[]>();
  for (const faceIndex of faceIndices) {
    const edges = getTrianglePositionEdgeKeys(geometry, faceIndex);
    for (const edgeKey of edges) {
      const list = edgeToFaces.get(edgeKey);
      if (list) list.push(faceIndex);
      else edgeToFaces.set(edgeKey, [faceIndex]);
    }
  }
  const adjacency = new Map<number, number[]>();
  for (const faceList of edgeToFaces.values()) {
    if (faceList.length < 2) continue;
    for (let i = 0; i < faceList.length; i++) {
      for (let j = i + 1; j < faceList.length; j++) {
        addAdjacencyEdge(adjacency, faceList[i], faceList[j]);
      }
    }
  }
  return adjacency;
}

/**
 * Adds an undirected adjacency link between two face indices.
 * @param adjacency Adjacency map to mutate.
 * @param a First face index.
 * @param b Second face index.
 */
function addAdjacencyEdge(
  adjacency: Map<number, number[]>,
  a: number,
  b: number
): void {
  const listA = adjacency.get(a);
  if (listA) {
    if (!listA.includes(b)) listA.push(b);
  } else {
    adjacency.set(a, [b]);
  }
  const listB = adjacency.get(b);
  if (listB) {
    if (!listB.includes(a)) listB.push(a);
  } else {
    adjacency.set(b, [a]);
  }
}

/**
 * Returns three quantized edge keys for a triangle (position-based).
 * @param geometry Source geometry.
 * @param faceIndex Triangle index.
 * @returns Edge key strings.
 */
function getTrianglePositionEdgeKeys(
  geometry: THREE.BufferGeometry,
  faceIndex: number
): [string, string, string] {
  const positions = geometry.getAttribute('position');
  const [i0, i1, i2] = getTriangleVertexIndices(geometry, faceIndex);
  const p0 = getVertexPosition(positions, i0);
  const p1 = getVertexPosition(positions, i1);
  const p2 = getVertexPosition(positions, i2);
  return [
    makePositionEdgeKey(p0, p1),
    makePositionEdgeKey(p1, p2),
    makePositionEdgeKey(p2, p0)
  ];
}

/**
 * Builds a stable key for an unordered edge from two positions.
 * @param a First endpoint.
 * @param b Second endpoint.
 * @returns Quantized edge key.
 */
function makePositionEdgeKey(a: THREE.Vector3, b: THREE.Vector3): string {
  const qa = quantizePositionKey(a);
  const qb = quantizePositionKey(b);
  return qa < qb ? `${qa}|${qb}` : `${qb}|${qa}`;
}

/**
 * Quantizes a position for edge matching across non-indexed duplicates.
 * @param point World/local position.
 * @returns Compact coordinate key.
 */
function quantizePositionKey(point: THREE.Vector3): string {
  const scale = 1e5;
  const x = Math.round(point.x * scale);
  const y = Math.round(point.y * scale);
  const z = Math.round(point.z * scale);
  return `${x},${y},${z}`;
}

/**
 * Tests whether a triangle shares the seed face plane and normal direction.
 * @param geometry The buffer geometry.
 * @param faceIndex The triangle to test.
 * @param seedNormal The seed face normal.
 * @param seedPlaneConstant The seed plane constant (n·p).
 * @param normalDotTolerance Minimum normal alignment.
 * @param planeTolerance Max plane distance error.
 * @returns True if the triangle is coplanar with the seed.
 */
function isTriangleCoplanarWithSeed(
  geometry: THREE.BufferGeometry,
  faceIndex: number,
  seedNormal: THREE.Vector3,
  seedPlaneConstant: number,
  normalDotTolerance: number,
  planeTolerance: number
): boolean {
  const normal = computeTriangleNormal(geometry, faceIndex);
  if (Math.abs(normal.dot(seedNormal)) < normalDotTolerance) {
    return false;
  }
  const centroid = computeTriangleCentroid(geometry, faceIndex);
  const planeError = Math.abs(seedNormal.dot(centroid) - seedPlaneConstant);
  return planeError <= planeTolerance;
}

/**
 * Collects unique position-attribute indices referenced by face indices.
 * @param geometry The buffer geometry.
 * @param faceIndices The triangle indices.
 * @returns Sorted unique vertex indices.
 */
export function getUniqueVertexIndicesForFaces(
  geometry: THREE.BufferGeometry,
  faceIndices: number[]
): number[] {
  const vertexSet = new Set<number>();
  faceIndices.forEach((faceIndex) => {
    const [i0, i1, i2] = getTriangleVertexIndices(geometry, faceIndex);
    vertexSet.add(i0);
    vertexSet.add(i1);
    vertexSet.add(i2);
  });
  return Array.from(vertexSet).sort((a, b) => a - b);
}
