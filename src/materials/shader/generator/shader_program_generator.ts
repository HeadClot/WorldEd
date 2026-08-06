import type * as THREE from 'three';
import type { ShaderChunk } from '../chunk/shader_chunk.js';
import type { ShaderProgramBase } from './shader_program_base.js';

/** Assembled ShaderMaterial sources and uniforms. */
export interface GeneratedShaderProgram {
  uniforms: Record<string, THREE.IUniform>;
  vertexShader: string;
  fragmentShader: string;
}

/** Default linear color variable name used when blending chunks. */
const LINEAR_COLOR_VARIABLE = 'linearColor';

/**
 * Composes a base editor shader with zero or more reusable GLSL chunks into a
 * single vertex/fragment program and uniform map.
 */
export class ShaderProgramGenerator {
  /**
   * Builds a complete shader program from a base and optional chunks.
   *
   * @param base Core lighting or unlit program.
   * @param chunks Reusable contributions (e.g. projected grid).
   * @returns Uniforms plus vertex and fragment source.
   */
  static generate(base: ShaderProgramBase, chunks: readonly ShaderChunk[] = []): GeneratedShaderProgram {
    return {
      uniforms: this.collectUniforms(base, chunks),
      vertexShader: this.assembleVertexShader(base, chunks),
      fragmentShader: this.assembleFragmentShader(base, chunks),
    };
  }

  /**
   * Merges base and chunk uniforms into one dictionary.
   *
   * @param base Core program.
   * @param chunks Optional chunks.
   * @returns Combined uniforms.
   */
  private static collectUniforms(
    base: ShaderProgramBase,
    chunks: readonly ShaderChunk[],
  ): Record<string, THREE.IUniform> {
    const uniforms: Record<string, THREE.IUniform> = { ...base.baseUniforms() };
    for (const chunk of chunks) {
      chunk.collectUniforms(uniforms);
    }
    return uniforms;
  }

  /**
   * Assembles the vertex shader from base and chunk contributions.
   *
   * @param base Core program.
   * @param chunks Optional chunks.
   * @returns Vertex shader source.
   */
  private static assembleVertexShader(base: ShaderProgramBase, chunks: readonly ShaderChunk[]): string {
    return [
      base.vertexDeclarations(),
      this.joinChunkVertexDeclarations(chunks),
      'void main() {',
      base.vertexMainStatements(),
      this.joinChunkVertexMainStatements(chunks),
      base.vertexPositionStatements(),
      '}',
    ].join('\n');
  }

  /**
   * Assembles the fragment shader from base and chunk contributions.
   *
   * @param base Core program.
   * @param chunks Optional chunks.
   * @returns Fragment shader source.
   */
  private static assembleFragmentShader(base: ShaderProgramBase, chunks: readonly ShaderChunk[]): string {
    return [
      base.fragmentDeclarations(),
      this.joinChunkFragmentDeclarations(chunks),
      base.fragmentHelperFunctions(),
      this.joinChunkFragmentHelpers(chunks),
      'void main() {',
      base.fragmentComputeLinearColor(LINEAR_COLOR_VARIABLE),
      this.joinChunkFragmentColorModifiers(chunks, LINEAR_COLOR_VARIABLE),
      base.fragmentWriteOutput(LINEAR_COLOR_VARIABLE),
      this.joinChunkEncodedColorModifiers(chunks, 'gl_FragColor.rgb'),
      '}',
    ].join('\n');
  }

  /**
   * Concatenates vertex declarations from all chunks.
   *
   * @param chunks Shader chunks.
   * @returns Combined GLSL.
   */
  private static joinChunkVertexDeclarations(chunks: readonly ShaderChunk[]): string {
    return chunks.map((chunk) => chunk.vertexDeclarations()).join('\n');
  }

  /**
   * Concatenates vertex main statements from all chunks.
   *
   * @param chunks Shader chunks.
   * @returns Combined GLSL.
   */
  private static joinChunkVertexMainStatements(chunks: readonly ShaderChunk[]): string {
    return chunks.map((chunk) => chunk.vertexMainStatements()).join('\n');
  }

  /**
   * Concatenates fragment declarations from all chunks.
   *
   * @param chunks Shader chunks.
   * @returns Combined GLSL.
   */
  private static joinChunkFragmentDeclarations(chunks: readonly ShaderChunk[]): string {
    return chunks.map((chunk) => chunk.fragmentDeclarations()).join('\n');
  }

  /**
   * Concatenates fragment helper functions from all chunks.
   *
   * @param chunks Shader chunks.
   * @returns Combined GLSL.
   */
  private static joinChunkFragmentHelpers(chunks: readonly ShaderChunk[]): string {
    return chunks.map((chunk) => chunk.fragmentHelperFunctions()).join('\n');
  }

  /**
   * Concatenates fragment linear-color modifiers from all chunks.
   *
   * @param chunks Shader chunks.
   * @param linearColorVariableName Linear albedo variable name.
   * @returns Combined GLSL.
   */
  private static joinChunkFragmentColorModifiers(
    chunks: readonly ShaderChunk[],
    linearColorVariableName: string,
  ): string {
    return chunks.map((chunk) => chunk.fragmentModifyLinearColor(linearColorVariableName)).join('\n');
  }

  /**
   * Concatenates display-space encoded RGB modifiers from all chunks.
   *
   * @param chunks Shader chunks.
   * @param encodedRgbVariableName Encoded RGB variable name.
   * @returns Combined GLSL.
   */
  private static joinChunkEncodedColorModifiers(
    chunks: readonly ShaderChunk[],
    encodedRgbVariableName: string,
  ): string {
    return chunks.map((chunk) => chunk.fragmentModifyEncodedColor(encodedRgbVariableName)).join('\n');
  }
}
