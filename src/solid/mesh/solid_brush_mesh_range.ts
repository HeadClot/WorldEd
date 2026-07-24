/**
 * Byte/vertex range of one brush's contribution inside the combined result mesh.
 */
export interface SolidBrushMeshRange {
  /** Brush instance id. */
  brushId: string;
  /** First vertex index (non-indexed mesh). */
  vertexStart: number;
  /** Vertex count (triangleCount * 3). */
  vertexCount: number;
  /** First triangle index. */
  triangleStart: number;
  /** Triangle count. */
  triangleCount: number;
}

/**
 * GPU attribute update window for a dirty brush patch.
 */
export interface SolidMeshUpdateRange {
  /** First float index in the position/normal arrays (vertexStart * 3). */
  positionFloatStart: number;
  /** Float count in position/normal arrays (vertexCount * 3). */
  positionFloatCount: number;
  /** First float index in the UV array (vertexStart * 2). */
  uvFloatStart: number;
  /** Float count in the UV array (vertexCount * 2). */
  uvFloatCount: number;
}
