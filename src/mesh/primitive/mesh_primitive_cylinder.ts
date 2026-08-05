import { MeshDocument } from '@/mesh/document/mesh_document.js';
import { meshCornerUvsFromVertexUvs } from '@/mesh/convert/mesh_corner_uv_from_vertex_uv.js';
import { meshDocumentFromTriangleList } from '@/mesh/convert/mesh_from_triangle_list.js';

/**
 * Builds a Y-up cylinder mesh document with top, bottom, and side triangles.
 *
 * @param radiusTop Top radius.
 * @param radiusBottom Bottom radius.
 * @param height Cylinder height.
 * @param radialSegments Radial segments (minimum 3).
 * @param heightSegments Height segments (minimum 1).
 * @param openEnded When true, omits top and bottom caps.
 * @returns Mesh document for the cylinder.
 */
export function createMeshDocumentCylinder(
  radiusTop: number = 0.5,
  radiusBottom: number = 0.5,
  height: number = 1,
  radialSegments: number = 16,
  heightSegments: number = 1,
  openEnded: boolean = false,
): MeshDocument {
  const segments = Math.max(3, Math.floor(radialSegments));
  const stacks = Math.max(1, Math.floor(heightSegments));
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  appendCylinderBody(positions, uvs, indices, radiusTop, radiusBottom, height, segments, stacks);
  if (!openEnded) {
    appendCylinderCap(positions, uvs, indices, radiusTop, height * 0.5, segments, true);
    appendCylinderCap(positions, uvs, indices, radiusBottom, -height * 0.5, segments, false);
  }
  const cornerUvs = meshCornerUvsFromVertexUvs(indices, uvs);
  return meshDocumentFromTriangleList(Float32Array.from(positions), indices, cornerUvs);
}

/**
 * Appends the side wall vertices and indices.
 *
 * @param positions Position accumulator.
 * @param uvs UV accumulator.
 * @param indices Index accumulator.
 * @param radiusTop Top radius.
 * @param radiusBottom Bottom radius.
 * @param height Full height.
 * @param segments Radial segments.
 * @param stacks Height segments.
 */
function appendCylinderBody(
  positions: number[],
  uvs: number[],
  indices: number[],
  radiusTop: number,
  radiusBottom: number,
  height: number,
  segments: number,
  stacks: number,
): void {
  const vertexStart = Math.floor(positions.length / 3);
  for (let stack = 0; stack <= stacks; stack++) {
    const t = stack / stacks;
    const y = -height * 0.5 + t * height;
    const radius = radiusBottom + (radiusTop - radiusBottom) * t;
    appendCylinderRing(positions, uvs, radius, y, segments, t);
  }
  appendCylinderBodyIndices(indices, vertexStart, segments, stacks);
}

/**
 * Appends one horizontal ring of vertices.
 *
 * @param positions Position accumulator.
 * @param uvs UV accumulator.
 * @param radius Ring radius.
 * @param y Ring Y.
 * @param segments Radial segments.
 * @param v Texture V.
 */
function appendCylinderRing(
  positions: number[],
  uvs: number[],
  radius: number,
  y: number,
  segments: number,
  v: number,
): void {
  for (let segment = 0; segment <= segments; segment++) {
    const u = segment / segments;
    const angle = u * Math.PI * 2;
    positions.push(radius * Math.cos(angle), y, radius * Math.sin(angle));
    uvs.push(u, v);
  }
}

/**
 * Appends side-wall triangle indices for stacked rings.
 *
 * @param indices Index accumulator.
 * @param vertexStart First body vertex index.
 * @param segments Radial segments.
 * @param stacks Height segments.
 */
function appendCylinderBodyIndices(indices: number[], vertexStart: number, segments: number, stacks: number): void {
  const stride = segments + 1;
  for (let stack = 0; stack < stacks; stack++) {
    for (let segment = 0; segment < segments; segment++) {
      const a = vertexStart + stack * stride + segment;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, b, d);
      indices.push(a, d, c);
    }
  }
}

/**
 * Appends a fan-capped end of the cylinder.
 *
 * @param positions Position accumulator.
 * @param uvs UV accumulator.
 * @param indices Index accumulator.
 * @param radius Cap radius.
 * @param y Cap Y.
 * @param segments Radial segments.
 * @param isTop True for the top cap winding.
 */
function appendCylinderCap(
  positions: number[],
  uvs: number[],
  indices: number[],
  radius: number,
  y: number,
  segments: number,
  isTop: boolean,
): void {
  const centerIndex = Math.floor(positions.length / 3);
  positions.push(0, y, 0);
  uvs.push(0.5, 0.5);
  const ringStart = centerIndex + 1;
  for (let segment = 0; segment <= segments; segment++) {
    const u = segment / segments;
    const angle = u * Math.PI * 2;
    const x = radius * Math.cos(angle);
    const z = radius * Math.sin(angle);
    positions.push(x, y, z);
    uvs.push(x / (radius * 2) + 0.5, z / (radius * 2) + 0.5);
  }
  for (let segment = 0; segment < segments; segment++) {
    const a = ringStart + segment;
    const b = ringStart + segment + 1;
    if (isTop) {
      indices.push(centerIndex, b, a);
    } else {
      indices.push(centerIndex, a, b);
    }
  }
}
