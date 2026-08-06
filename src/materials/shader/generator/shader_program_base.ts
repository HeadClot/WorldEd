import type * as THREE from 'three';

/**
 * Core shader program body that a {@link ShaderProgramGenerator} wraps with
 * optional {@link ShaderChunk} contributions.
 */
export interface ShaderProgramBase {
  /**
   * Returns base uniforms owned by this program (not shared chunk uniforms).
   *
   * @returns Uniform dictionary with owned value objects.
   */
  baseUniforms(): Record<string, THREE.IUniform>;

  /**
   * Returns GLSL declarations unique to this program's vertex stage.
   *
   * @returns Vertex declaration source.
   */
  vertexDeclarations(): string;

  /**
   * Returns GLSL statements for vertex main before gl_Position assignment.
   *
   * @returns Vertex main statements.
   */
  vertexMainStatements(): string;

  /**
   * Returns the gl_Position assignment (and any post-position vertex work).
   *
   * @returns Vertex position statements.
   */
  vertexPositionStatements(): string;

  /**
   * Returns GLSL declarations unique to this program's fragment stage.
   *
   * @returns Fragment declaration source.
   */
  fragmentDeclarations(): string;

  /**
   * Returns GLSL helper functions unique to this program.
   *
   * @returns Fragment helper source.
   */
  fragmentHelperFunctions(): string;

  /**
   * Returns GLSL that declares and fills a vec3 linearColor variable.
   *
   * @param linearColorVariableName Name of the linear albedo variable to write.
   * @returns Fragment statements.
   */
  fragmentComputeLinearColor(linearColorVariableName: string): string;

  /**
   * Returns GLSL that writes gl_FragColor from the final linear color.
   *
   * @param linearColorVariableName Name of the final linear albedo variable.
   * @returns Fragment output statements.
   */
  fragmentWriteOutput(linearColorVariableName: string): string;
}
