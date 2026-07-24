import * as THREE from 'three';
import { FaceTextureMapping } from '../../texture/face_texture_mapping.js';
import {
  projectWorldPositionToUv,
  resolveProjectionBasis,
} from '../../texture/planar_uv_projector.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '../../texture/texture_id.js';
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

/**
 * Options controlling how solid chunk UVs are projected.
 */
export interface SolidChunkUvBakeOptions {
  /**
   * When true, project in brush-local space so textures stick to the brush
   * (Tex Lock). When false, project in world space (textures stay in the world).
   */
  stickToBrush: boolean;
  /** Solid-model → world matrix of the result mesh. */
  resultWorldMatrix: THREE.Matrix4;
  /**
   * Brush local → solid-model matrix (pose of this brush in the solid).
   * Required when stickToBrush is true.
   */
  brushModelMatrix?: THREE.Matrix4;
  /**
   * Brush face normal in brush-local space (for local UV basis).
   * Falls back to the shaded polygon normal when omitted.
   */
  resolveLocalFaceNormal?: (surfaceIndex: number) => THREE.Vector3;
  /**
   * Brush face normal in solid-model space (for world UV basis).
   * Falls back to the shaded polygon normal when omitted.
   */
  resolveModelFaceNormal?: (surfaceIndex: number) => THREE.Vector3;
}

/**
 * Builds and holds UV bake scratch state for chunk construction.
 */
export class SolidBrushMeshChunkBuilder {
  private readonly scratchPoint = new THREE.Vector3();
  private readonly scratchNormal = new THREE.Vector3();
  private readonly scratchInverse = new THREE.Matrix4();
  private readonly scratchNormalMatrix = new THREE.Matrix3();

  /**
   * Triangulates polygons and bakes planar UVs into a reusable brush chunk.
   * @param polygons Compiled polygons for one brush.
   * @param resolveMapping Maps surface index to authored face mapping.
   * @param uvOptions World vs brush-local UV projection controls.
   * @returns Mesh chunk ready for assembly.
   */
  build(
    polygons: SolidCompiledPolygon[],
    resolveMapping: (surfaceIndex: number) => FaceTextureMapping,
    uvOptions: SolidChunkUvBakeOptions,
  ): SolidBrushMeshChunk {
    const vertexCount = this.countVertices(polygons);
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const regions: SolidSurfaceRegion[] = [];
    const triangleSources: SolidTriangleSource[] = [];
    let triangleCount = 0;
    let vertexWrite = 0;
    if (uvOptions.stickToBrush && uvOptions.brushModelMatrix) {
      this.scratchInverse.copy(uvOptions.brushModelMatrix).invert();
    }
    for (const polygon of polygons) {
      triangleCount = this.writePolygon(
        polygon,
        resolveMapping,
        uvOptions,
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
   * @param polygon Source polygon.
   * @param resolveMapping Face mapping resolver.
   * @param uvOptions UV projection options.
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
    resolveMapping: (surfaceIndex: number) => FaceTextureMapping,
    uvOptions: SolidChunkUvBakeOptions,
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
    const textureId = polygon.textureId || DEFAULT_CHECKER_TEXTURE_ID;
    const mapping = resolveMapping(polygon.surfaceIndex);
    const basis = this.buildUvBasis(polygon, mapping, uvOptions);
    const regionIndices: number[] = [];
    for (let step = 0; step < tris.length; step++) {
      regionIndices.push(triangleCount + step);
      triangleSources.push({
        brushId: polygon.brushId,
        surfaceIndex: polygon.surfaceIndex,
        textureId,
      });
      vertexWrite = this.writeTriangleCorners(
        polygon,
        tris[step],
        mapping,
        basis,
        uvOptions,
        positions,
        normals,
        uvs,
        vertexWrite,
      );
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
   * Builds a UV projection basis in the space used for projection.
   * @param polygon Source polygon.
   * @param mapping Face mapping.
   * @param uvOptions UV options.
   * @returns Projection basis.
   */
  private buildUvBasis(
    polygon: SolidCompiledPolygon,
    mapping: FaceTextureMapping,
    uvOptions: SolidChunkUvBakeOptions,
  ): ReturnType<typeof resolveProjectionBasis> {
    if (uvOptions.stickToBrush) {
      const localNormal =
        uvOptions.resolveLocalFaceNormal?.(polygon.surfaceIndex) ?? polygon.normal;
      this.scratchNormal.copy(localNormal).normalize();
      return resolveProjectionBasis(this.scratchNormal, mapping);
    }
    const modelNormal = uvOptions.resolveModelFaceNormal?.(polygon.surfaceIndex) ?? polygon.normal;
    this.scratchNormalMatrix.getNormalMatrix(uvOptions.resultWorldMatrix);
    this.scratchNormal.copy(modelNormal).applyMatrix3(this.scratchNormalMatrix).normalize();
    return resolveProjectionBasis(this.scratchNormal, mapping);
  }

  /**
   * Writes one triangle's three corners into the buffers.
   * @param polygon Source polygon.
   * @param cornerIndices Three local vertex indices into the polygon.
   * @param mapping UV mapping.
   * @param basis Projection basis.
   * @param uvOptions UV projection options.
   * @param positions Position buffer.
   * @param normals Normal buffer.
   * @param uvs UV buffer.
   * @param vertexWrite Next vertex index.
   * @returns Updated vertex write index.
   */
  private writeTriangleCorners(
    polygon: SolidCompiledPolygon,
    cornerIndices: number[],
    mapping: FaceTextureMapping,
    basis: ReturnType<typeof resolveProjectionBasis>,
    uvOptions: SolidChunkUvBakeOptions,
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
      this.projectVertexToUv(vertex, mapping, basis, uvOptions, uvs, vertexWrite);
      vertexWrite += 1;
    }
    return vertexWrite;
  }

  /**
   * Projects one vertex into the UV buffer.
   * @param modelVertex Vertex in solid model space.
   * @param mapping Face mapping.
   * @param basis Projection basis.
   * @param uvOptions UV options.
   * @param uvs UV buffer.
   * @param vertexWrite Vertex index to write.
   */
  private projectVertexToUv(
    modelVertex: THREE.Vector3,
    mapping: FaceTextureMapping,
    basis: ReturnType<typeof resolveProjectionBasis>,
    uvOptions: SolidChunkUvBakeOptions,
    uvs: Float32Array,
    vertexWrite: number,
  ): void {
    if (uvOptions.stickToBrush && uvOptions.brushModelMatrix) {
      this.scratchPoint.copy(modelVertex).applyMatrix4(this.scratchInverse);
    } else {
      this.scratchPoint.copy(modelVertex).applyMatrix4(uvOptions.resultWorldMatrix);
    }
    const coords = projectWorldPositionToUv(this.scratchPoint, basis, mapping);
    const uvBase = vertexWrite * 2;
    uvs[uvBase] = coords.u;
    uvs[uvBase + 1] = coords.v;
  }
}
