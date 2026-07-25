import * as THREE from 'three';
import { DEFAULT_CHECKER_TEXTURE_ID } from '../../texture/library/texture_id.js';
import { FaceSurfaceDescription, createDefaultFaceSurface } from '../../texture/uv_matrix/face_surface_description.js';
import { SolidCompiledPolygon } from '../algorithm/solid_compiled_polygon.js';
import { SurfaceTriangulator } from '../algorithm/surface_triangulator.js';
import { SolidSurfaceRegion, SolidTriangleSource } from '../algorithm/surface_triangulator.js';

/**
 * Pre-triangulated, UV-baked output for one brush. Reused across partial
 * updates so only brushes in the recompile set pay meshing cost.
 */
export interface SolidBrushMeshChunk {
  /** Interleaved XYZ positions (3 floats per vertex, 3 verts per triangle). */
  positions: Float32Array;
  /** Interleaved XYZ normals matching positions. */
  normals: Float32Array;
  /** Interleaved UV pairs matching positions. */
  uvs: Float32Array;
  /** Number of triangles in this chunk. */
  triangleCount: number;
  /** Number of vertices (triangleCount * 3). */
  vertexCount: number;
  /** Surface regions with triangle indices local to this chunk (0-based). */
  regions: SolidSurfaceRegion[];
  /** Per-triangle sources local to this chunk. */
  triangleSources: SolidTriangleSource[];
}

/** Options controlling how solid chunk UVs are projected. */
export interface SolidChunkUvBakeOptions {
  /**
   * Brush local → solid-model matrix. Used to convert model-space vertices into
   * brush-local space before applying the authored UV matrix.
   */
  brushModelMatrix?: THREE.Matrix4;
}

/** Builds and holds UV bake scratch state for chunk construction. */
export class SolidBrushMeshChunkBuilder {
  private readonly scratchPoint = new THREE.Vector3();
  private readonly scratchInverse = new THREE.Matrix4();

  /**
   * Triangulates polygons and bakes UV matrices into a reusable brush chunk.
   *
   * @param polygons Compiled polygons for one brush.
   * @param resolveSurface Maps surface index to authored face surface.
   * @param uvOptions Brush model matrix for local UV projection.
   * @returns Mesh chunk ready for assembly.
   */
  build(
    polygons: SolidCompiledPolygon[],
    resolveSurface: (surfaceIndex: number) => FaceSurfaceDescription,
    uvOptions: SolidChunkUvBakeOptions = {},
  ): SolidBrushMeshChunk {
    const vertexCount = this.countVertices(polygons);
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const regions: SolidSurfaceRegion[] = [];
    const triangleSources: SolidTriangleSource[] = [];
    let triangleCount = 0;
    let vertexWrite = 0;
    if (uvOptions.brushModelMatrix) {
      this.scratchInverse.copy(uvOptions.brushModelMatrix).invert();
    } else {
      this.scratchInverse.identity();
    }
    for (const polygon of polygons) {
      triangleCount = this.writePolygon(
        polygon,
        resolveSurface,
        positions,
        normals,
        uvs,
        regions,
        triangleSources,
        triangleCount,
        vertexWrite,
      );
      vertexWrite = triangleCount * 3;
    }
    return {
      positions,
      normals,
      uvs,
      triangleCount,
      vertexCount: triangleCount * 3,
      regions,
      triangleSources,
    };
  }

  /**
   * Counts non-indexed vertices produced by fan triangulation.
   *
   * @param polygons Input polygons.
   * @returns Vertex count.
   */
  private countVertices(polygons: SolidCompiledPolygon[]): number {
    let count = 0;
    for (const polygon of polygons) {
      const tris = SurfaceTriangulator.triangulateConvexVertices(polygon.vertices);
      count += tris.length * 3;
    }
    return count;
  }

  /**
   * Writes one polygon's triangles into the chunk buffers.
   *
   * @param polygon Source polygon.
   * @param resolveSurface Face surface resolver.
   * @param positions Position buffer.
   * @param normals Normal buffer.
   * @param uvs UV buffer.
   * @param regions Region accumulator.
   * @param triangleSources Source accumulator.
   * @param triangleCount Triangles written so far.
   * @param vertexWrite Next vertex index to write.
   * @returns Updated triangle count.
   */
  private writePolygon(
    polygon: SolidCompiledPolygon,
    resolveSurface: (surfaceIndex: number) => FaceSurfaceDescription,
    positions: Float32Array,
    normals: Float32Array,
    uvs: Float32Array,
    regions: SolidSurfaceRegion[],
    triangleSources: SolidTriangleSource[],
    triangleCount: number,
    vertexWrite: number,
  ): number {
    const tris = SurfaceTriangulator.triangulateConvexVertices(polygon.vertices);
    if (tris.length < 1) return triangleCount;
    const surface = resolveSurface(polygon.surfaceIndex) ?? createDefaultFaceSurface();
    const textureId = polygon.textureId || surface.textureId || DEFAULT_CHECKER_TEXTURE_ID;
    const regionIndices: number[] = [];
    for (let step = 0; step < tris.length; step++) {
      regionIndices.push(triangleCount + step);
      triangleSources.push({
        brushId: polygon.brushId,
        surfaceIndex: polygon.surfaceIndex,
        textureId,
      });
      vertexWrite = this.writeTriangleCorners(polygon, tris[step], surface, positions, normals, uvs, vertexWrite);
    }
    regions.push({
      triangleIndices: regionIndices,
      textureId,
      brushId: polygon.brushId,
      surfaceIndex: polygon.surfaceIndex,
    });
    return triangleCount + tris.length;
  }

  /**
   * Writes one triangle's three corners into the buffers.
   *
   * @param polygon Source polygon.
   * @param cornerIndices Three local vertex indices into the polygon.
   * @param surface Authored face surface.
   * @param positions Position buffer.
   * @param normals Normal buffer.
   * @param uvs UV buffer.
   * @param vertexWrite Next vertex index.
   * @returns Updated vertex write index.
   */
  private writeTriangleCorners(
    polygon: SolidCompiledPolygon,
    cornerIndices: number[],
    surface: FaceSurfaceDescription,
    positions: Float32Array,
    normals: Float32Array,
    uvs: Float32Array,
    vertexWrite: number,
  ): number {
    for (const localIndex of cornerIndices) {
      const vertex = polygon.vertices[localIndex];
      const base = vertexWrite * 3;
      positions[base] = vertex.x;
      positions[base + 1] = vertex.y;
      positions[base + 2] = vertex.z;
      normals[base] = polygon.normal.x;
      normals[base + 1] = polygon.normal.y;
      normals[base + 2] = polygon.normal.z;
      this.projectVertexToUv(vertex, surface, uvs, vertexWrite);
      vertexWrite += 1;
    }
    return vertexWrite;
  }

  /**
   * Projects one model-space vertex into the UV buffer using the brush-local UV
   * matrix.
   *
   * @param modelVertex Vertex in solid model space.
   * @param surface Authored face surface.
   * @param uvs UV buffer.
   * @param vertexWrite Vertex index to write.
   */
  private projectVertexToUv(
    modelVertex: THREE.Vector3,
    surface: FaceSurfaceDescription,
    uvs: Float32Array,
    vertexWrite: number,
  ): void {
    this.scratchPoint.copy(modelVertex).applyMatrix4(this.scratchInverse);
    const coords = surface.uv.project(this.scratchPoint);
    const uvBase = vertexWrite * 2;
    uvs[uvBase] = coords.u;
    uvs[uvBase + 1] = coords.v;
  }
}
