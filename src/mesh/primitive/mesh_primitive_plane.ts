import { MeshDocument } from '@/mesh/document/mesh_document.js';
import { MeshTopologyBuilder } from '@/mesh/topology/mesh_topology_builder.js';

/**
 * Builds a centered XY plane mesh document (open, with boundary edges).
 *
 * @param width Extent on X.
 * @param height Extent on Y.
 * @param widthSegments Segments along X (minimum 1).
 * @param heightSegments Segments along Y (minimum 1).
 * @returns Mesh document for an open plane.
 */
export function createMeshDocumentPlane(
  width: number = 1,
  height: number = 1,
  widthSegments: number = 1,
  heightSegments: number = 1,
): MeshDocument {
  const segmentsX = Math.max(1, Math.floor(widthSegments));
  const segmentsY = Math.max(1, Math.floor(heightSegments));
  const builder = new MeshTopologyBuilder();
  const grid = appendPlaneGrid(builder, width, height, segmentsX, segmentsY);
  appendPlaneTriangles(builder, grid, segmentsX, segmentsY);
  return new MeshDocument(builder.build());
}

/**
 * Appends a regular vertex grid for a plane.
 *
 * @param builder Topology builder.
 * @param width Plane width.
 * @param height Plane height.
 * @param segmentsX X segment count.
 * @param segmentsY Y segment count.
 * @returns Row-major vertex index grid.
 */
function appendPlaneGrid(
  builder: MeshTopologyBuilder,
  width: number,
  height: number,
  segmentsX: number,
  segmentsY: number,
): number[][] {
  const rows: number[][] = [];
  for (let row = 0; row <= segmentsY; row++) {
    rows.push(appendPlaneGridRow(builder, width, height, segmentsX, segmentsY, row));
  }
  return rows;
}

/**
 * Appends one row of plane vertices.
 *
 * @param builder Topology builder.
 * @param width Plane width.
 * @param height Plane height.
 * @param segmentsX X segment count.
 * @param segmentsY Y segment count.
 * @param row Row index from 0..segmentsY.
 * @returns Vertex indices for the row.
 */
function appendPlaneGridRow(
  builder: MeshTopologyBuilder,
  width: number,
  height: number,
  segmentsX: number,
  segmentsY: number,
  row: number,
): number[] {
  const indices: number[] = [];
  const y = -height * 0.5 + (row / segmentsY) * height;
  for (let column = 0; column <= segmentsX; column++) {
    const x = -width * 0.5 + (column / segmentsX) * width;
    indices.push(builder.appendVertex(x, y, 0));
  }
  return indices;
}

/**
 * Appends two triangles per grid cell.
 *
 * @param builder Topology builder.
 * @param grid Row-major vertex indices.
 * @param segmentsX X segment count.
 * @param segmentsY Y segment count.
 */
function appendPlaneTriangles(
  builder: MeshTopologyBuilder,
  grid: number[][],
  segmentsX: number,
  segmentsY: number,
): void {
  for (let row = 0; row < segmentsY; row++) {
    for (let column = 0; column < segmentsX; column++) {
      const a = grid[row]![column]!;
      const b = grid[row]![column + 1]!;
      const c = grid[row + 1]![column + 1]!;
      const d = grid[row + 1]![column]!;
      builder.appendTriangle(a, b, c);
      builder.appendTriangle(a, c, d);
    }
  }
}
