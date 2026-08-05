/**
 * Ear-clip triangulation for simple planar polygons (mesh display / OBJ
 * import). Preserves input loop winding (no forced 2D CCW reverse that inverts
 * faces). Fan triangulation incorrectly fills concave notches on n-gons.
 */

/** One 2D projected polygon vertex with its original loop index. */
interface ProjectedPolygonVertex {
  loopIndex: number;
  x: number;
  y: number;
}

/**
 * Triangulates a simple polygon given in 3D. Returns flat triples of indices
 * into the input point list (loop order). Empty when the face is unusable.
 * Output winding matches the input loop winding.
 *
 * @param points Ordered face corners in world/object space (at least 3).
 * @returns Triangle corner indices into {@code points}.
 */
export function triangulateSimplePolygon3d(points: ReadonlyArray<{ x: number; y: number; z: number }>): number[] {
  if (points.length < 3) {
    return [];
  }
  if (points.length === 3) {
    return isTriangleAreaPositive3d(points[0]!, points[1]!, points[2]!) ? [0, 1, 2] : [];
  }
  const projected = projectPolygonTo2d(points);
  if (projected.length < 3) {
    return [];
  }
  const orientation = Math.sign(signedArea2d(projected));
  if (orientation === 0) {
    return [];
  }
  return earClipProjectedPolygon(projected, orientation);
}

/**
 * Projects a 3D polygon onto its best-fit plane axes.
 *
 * @param points Ordered 3D corners.
 * @returns Projected vertices with original loop indices.
 */
function projectPolygonTo2d(points: ReadonlyArray<{ x: number; y: number; z: number }>): ProjectedPolygonVertex[] {
  const normal = computeNewellNormal(points);
  const axes = chooseProjectionAxes(normal);
  const projected: ProjectedPolygonVertex[] = [];
  for (let index = 0; index < points.length; index++) {
    const point = points[index]!;
    projected.push({
      loopIndex: index,
      x: readAxis(point, axes.u),
      y: readAxis(point, axes.v),
    });
  }
  return projected;
}

/**
 * Computes a polygon normal with the Newell method.
 *
 * @param points Ordered 3D corners.
 * @returns Normal (not required unit length for axis choice).
 */
function computeNewellNormal(points: ReadonlyArray<{ x: number; y: number; z: number }>): {
  x: number;
  y: number;
  z: number;
} {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let index = 0; index < points.length; index++) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    nx += (current.y - next.y) * (current.z + next.z);
    ny += (current.z - next.z) * (current.x + next.x);
    nz += (current.x - next.x) * (current.y + next.y);
  }
  return { x: nx, y: ny, z: nz };
}

/**
 * Chooses the two axes with largest projected area for a normal.
 *
 * @param normal Face normal.
 * @returns Axis pair as 'x' | 'y' | 'z'.
 */
function chooseProjectionAxes(normal: { x: number; y: number; z: number }): {
  u: 'x' | 'y' | 'z';
  v: 'x' | 'y' | 'z';
} {
  const ax = Math.abs(normal.x);
  const ay = Math.abs(normal.y);
  const az = Math.abs(normal.z);
  if (ax >= ay && ax >= az) {
    return { u: 'y', v: 'z' };
  }
  if (ay >= ax && ay >= az) {
    return { u: 'x', v: 'z' };
  }
  return { u: 'x', v: 'y' };
}

/**
 * Reads one coordinate axis from a point.
 *
 * @param point Source point.
 * @param axis Axis name.
 * @returns Component value.
 */
function readAxis(point: { x: number; y: number; z: number }, axis: 'x' | 'y' | 'z'): number {
  if (axis === 'x') {
    return point.x;
  }
  if (axis === 'y') {
    return point.y;
  }
  return point.z;
}

/**
 * Computes twice the signed area of a 2D polygon.
 *
 * @param projected Projected loop.
 * @returns Signed area * 2.
 */
function signedArea2d(projected: readonly ProjectedPolygonVertex[]): number {
  let area = 0;
  for (let index = 0; index < projected.length; index++) {
    const current = projected[index]!;
    const next = projected[(index + 1) % projected.length]!;
    area += current.x * next.y - next.x * current.y;
  }
  return area;
}

/**
 * Ear-clips a projected polygon into triangle index triples, keeping input
 * winding.
 *
 * @param projected Projected loop in original order.
 * @param orientation Sign of polygon area (+1 or -1).
 * @returns Flat triples of original loop indices.
 */
function earClipProjectedPolygon(projected: readonly ProjectedPolygonVertex[], orientation: number): number[] {
  const remaining = projected.map((vertex) => ({ ...vertex }));
  const triangles: number[] = [];
  let guard = remaining.length * remaining.length + 8;
  while (remaining.length > 3 && guard-- > 0) {
    const earIndex = findEarIndex(remaining, orientation);
    if (earIndex < 0) {
      break;
    }
    appendEarTriangle(remaining, earIndex, triangles);
    remaining.splice(earIndex, 1);
  }
  if (remaining.length === 3) {
    triangles.push(remaining[0]!.loopIndex, remaining[1]!.loopIndex, remaining[2]!.loopIndex);
  }
  return triangles;
}

/**
 * Finds the first ear tip index in a remaining polygon.
 *
 * @param remaining Remaining vertices.
 * @param orientation Polygon orientation sign.
 * @returns Ear tip index, or -1 when none found.
 */
function findEarIndex(remaining: readonly ProjectedPolygonVertex[], orientation: number): number {
  const count = remaining.length;
  for (let index = 0; index < count; index++) {
    if (isEar(remaining, index, orientation)) {
      return index;
    }
  }
  return -1;
}

/**
 * Appends one ear triangle in original loop winding.
 *
 * @param remaining Remaining vertices.
 * @param earIndex Ear tip index.
 * @param triangles Output triples.
 */
function appendEarTriangle(remaining: readonly ProjectedPolygonVertex[], earIndex: number, triangles: number[]): void {
  const count = remaining.length;
  const previous = remaining[(earIndex + count - 1) % count]!;
  const current = remaining[earIndex]!;
  const next = remaining[(earIndex + 1) % count]!;
  triangles.push(previous.loopIndex, current.loopIndex, next.loopIndex);
}

/**
 * Returns whether the vertex at index is an ear tip for the given orientation.
 *
 * @param remaining Remaining vertices.
 * @param earIndex Candidate tip.
 * @param orientation Polygon orientation sign.
 * @returns True when the tip forms a valid ear.
 */
function isEar(remaining: readonly ProjectedPolygonVertex[], earIndex: number, orientation: number): boolean {
  const count = remaining.length;
  const previous = remaining[(earIndex + count - 1) % count]!;
  const current = remaining[earIndex]!;
  const next = remaining[(earIndex + 1) % count]!;
  if (cross2d(previous, current, next) * orientation <= 1e-12) {
    return false;
  }
  for (let index = 0; index < count; index++) {
    if (index === earIndex || index === (earIndex + count - 1) % count || index === (earIndex + 1) % count) {
      continue;
    }
    if (pointInTriangle2d(remaining[index]!, previous, current, next)) {
      return false;
    }
  }
  return true;
}

/**
 * Cross product z-component for the turn a→b→c in 2D.
 *
 * @param a First point.
 * @param b Second point.
 * @param c Third point.
 * @returns Cross z.
 */
function cross2d(a: ProjectedPolygonVertex, b: ProjectedPolygonVertex, c: ProjectedPolygonVertex): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/**
 * Returns whether point p lies inside triangle abc (inclusive edges).
 *
 * @param point Query point.
 * @param a Triangle corner.
 * @param b Triangle corner.
 * @param c Triangle corner.
 * @returns True when inside.
 */
function pointInTriangle2d(
  point: ProjectedPolygonVertex,
  a: ProjectedPolygonVertex,
  b: ProjectedPolygonVertex,
  c: ProjectedPolygonVertex,
): boolean {
  const c1 = cross2d(a, b, point);
  const c2 = cross2d(b, c, point);
  const c3 = cross2d(c, a, point);
  const hasNeg = c1 < -1e-12 || c2 < -1e-12 || c3 < -1e-12;
  const hasPos = c1 > 1e-12 || c2 > 1e-12 || c3 > 1e-12;
  return !(hasNeg && hasPos);
}

/**
 * Returns whether a 3D triangle has non-zero area.
 *
 * @param a First corner.
 * @param b Second corner.
 * @param c Third corner.
 * @returns True when area is positive.
 */
function isTriangleAreaPositive3d(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  c: { x: number; y: number; z: number },
): boolean {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const acx = c.x - a.x;
  const acy = c.y - a.y;
  const acz = c.z - a.z;
  const cx = aby * acz - abz * acy;
  const cy = abz * acx - abx * acz;
  const cz = abx * acy - aby * acx;
  return cx * cx + cy * cy + cz * cz > 1e-20;
}
