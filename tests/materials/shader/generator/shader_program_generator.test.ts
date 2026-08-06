import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ShaderProgramGenerator } from '@/materials/shader/generator/shader_program_generator.js';
import { ShaderProgramContentViewLit } from '@/materials/shader/program/shader_program_content_view_lit.js';
import { SHADER_CHUNK_PROJECTED_GRID } from '@/materials/shader/chunk/shader_chunk_projected_grid.js';
import {
  getSharedProjectedGridUniforms,
  resetSharedProjectedGridUniforms,
} from '@/materials/shader/uniform/uniform_projected_grid_shared.js';

describe('ShaderProgramGenerator', () => {
  afterEach(() => {
    resetSharedProjectedGridUniforms();
  });

  it('composes content view lighting with the projected grid chunk', () => {
    const tint = new THREE.Color(0xffffff);
    const map = new THREE.Texture();
    const program = ShaderProgramGenerator.generate(new ShaderProgramContentViewLit(tint, map), [
      SHADER_CHUNK_PROJECTED_GRID,
    ]);
    expect(program.fragmentShader).toContain('studioViewportLuminance');
    expect(program.fragmentShader).toContain('evaluateProjectedGridLineColor');
    expect(program.fragmentShader).toContain('projectedGridAdaptiveLineColor');
    expect(program.fragmentShader).toContain('projectedGridLayerScreenFade');
    expect(program.fragmentShader).toContain('projectedGridGrazingFade');
    expect(program.fragmentShader).toContain('gl_FragColor = linearToOutputTexel');
    expect(program.vertexShader).toContain('vProjectedGridWorldPosition');
    expect(program.uniforms['map']?.value).toBe(map);
    expect(program.uniforms['projectedGridEnabled']).toBe(getSharedProjectedGridUniforms()['projectedGridEnabled']);
    map.dispose();
  });

  it('shares projected grid uniform objects across generated programs', () => {
    const a = ShaderProgramGenerator.generate(
      new ShaderProgramContentViewLit(new THREE.Color(0xffffff), new THREE.Texture()),
      [SHADER_CHUNK_PROJECTED_GRID],
    );
    const b = ShaderProgramGenerator.generate(
      new ShaderProgramContentViewLit(new THREE.Color(0xffffff), new THREE.Texture()),
      [SHADER_CHUNK_PROJECTED_GRID],
    );
    expect(a.uniforms['gridOrigin']).toBe(b.uniforms['gridOrigin']);
    expect(a.uniforms['cellSize']).toBe(b.uniforms['cellSize']);
    expect(a.uniforms['projectedGridEnabled']).toBe(b.uniforms['projectedGridEnabled']);
  });
});
