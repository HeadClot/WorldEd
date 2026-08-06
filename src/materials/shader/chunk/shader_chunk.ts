import type * as THREE from 'three';

/**
 * One reusable GLSL contribution that a {@link ShaderProgramGenerator} can merge
 * into any editor shader program without duplicating lattice or lighting source
 * on the TypeScript side.
 */
export interface ShaderChunk {
  /** Stable id used only for diagnostics and tests. */
  readonly chunkId: string;

  /**
   * Appends this chunk's uniforms into the target map. Shared uniform value
   * objects must be reused so one write updates every material.
   *
   * @param target Uniform dictionary being assembled for a ShaderMaterial.
   */
  collectUniforms(target: Record<string, THREE.IUniform>): void;

  /**
   * Returns GLSL declarations for the vertex stage (varyings, locals).
   *
   * @returns Vertex declaration source, or empty string.
   */
  vertexDeclarations(): string;

  /**
   * Returns GLSL statements injected into vertex main before gl_Position.
   *
   * @returns Vertex main statements, or empty string.
   */
  vertexMainStatements(): string;

  /**
   * Returns GLSL declarations for the fragment stage (uniforms are separate).
   *
   * @returns Fragment declaration source, or empty string.
   */
  fragmentDeclarations(): string;

  /**
   * Returns GLSL helper functions for the fragment stage.
   *
   * @returns Fragment function source, or empty string.
   */
  fragmentHelperFunctions(): string;

  /**
   * Returns GLSL statements that may modify a vec3 linearColor variable already
   * declared in fragment main. Empty when the chunk does not tint albedo.
   *
   * @param linearColorVariableName Name of the vec3 linear albedo variable.
   * @returns Fragment statements, or empty string.
   */
  fragmentModifyLinearColor(linearColorVariableName: string): string;

  /**
   * Returns GLSL statements that may modify encoded display RGB after
   * linearToOutputTexel (overlay-style compositing). Empty when unused.
   *
   * @param outputRgbVariableName Name of the vec3 display-space RGB variable.
   * @returns Fragment statements, or empty string.
   */
  fragmentModifyEncodedColor(outputRgbVariableName: string): string;
}
