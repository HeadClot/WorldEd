import * as THREE from 'three';
import { SHADER_CHUNK_PROJECTED_GRID } from './shader/chunk/shader_chunk_projected_grid.js';
import { ShaderProgramGenerator } from './shader/generator/shader_program_generator.js';
import { ShaderProgramContentViewLit } from './shader/program/shader_program_content_view_lit.js';

export { CONTENT_VIEW_LIT_AMBIENT } from './content_view_lit_constants.js';

/** UserData key marking content view-lit materials. */
export const CONTENT_VIEW_LIT_USERDATA_KEY = 'isContentViewLitMaterial';

/** Shared 1×1 white map when a surface has no texture. */
let whiteMap: THREE.DataTexture | null = null;

/**
 * Returns a shared white texture for untextured content.
 *
 * @returns 1×1 white DataTexture.
 */
function getWhiteMap(): THREE.DataTexture {
  if (!whiteMap) {
    whiteMap = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    whiteMap.colorSpace = THREE.SRGBColorSpace;
    whiteMap.needsUpdate = true;
  }
  return whiteMap;
}

/**
 * Content material with camera-locked studio viewport lighting and optional
 * projected surface grid (shared chunk uniforms, no overlay meshes).
 */
export class ContentViewLitMaterial extends THREE.ShaderMaterial {
  readonly color: THREE.Color;
  private _map: THREE.Texture | null;

  /**
   * @param color Tint.
   * @param map Albedo map, or null for white.
   * @param options Side only.
   */
  constructor(
    color: THREE.ColorRepresentation = 0xffffff,
    map: THREE.Texture | null = null,
    options: { side?: THREE.Side } = {},
  ) {
    const tint = new THREE.Color(color);
    const resolvedMap = map ?? getWhiteMap();
    const program = ShaderProgramGenerator.generate(new ShaderProgramContentViewLit(tint, resolvedMap), [
      SHADER_CHUNK_PROJECTED_GRID,
    ]);
    super({
      lights: false,
      toneMapped: false,
      side: options.side ?? THREE.FrontSide,
      uniforms: program.uniforms,
      vertexShader: program.vertexShader,
      fragmentShader: program.fragmentShader,
    });
    this.color = tint;
    this._map = map;
    this.userData[CONTENT_VIEW_LIT_USERDATA_KEY] = true;
    this.name = 'content_view_lit';
  }

  /** API compatibility with older content materials. */
  get flatShading(): boolean {
    return true;
  }

  /** @returns Current albedo map, or null when using the shared white map. */
  get map(): THREE.Texture | null {
    return this._map;
  }

  /** @param texture Albedo map, or null for white. */
  set map(texture: THREE.Texture | null) {
    this._map = texture;
    if (this.uniforms['map']) {
      this.uniforms['map'].value = texture ?? getWhiteMap();
    }
  }

  /** Keeps the diffuse uniform on the live color object. */
  override onBeforeRender(): void {
    if (this.uniforms['diffuse']) {
      this.uniforms['diffuse'].value = this.color;
    }
  }
}

/**
 * @param material Candidate material.
 * @returns True when this is a content view-lit material.
 */
export function isContentViewLitMaterial(material: THREE.Material): material is ContentViewLitMaterial {
  return material.userData[CONTENT_VIEW_LIT_USERDATA_KEY] === true;
}

/**
 * @param color Hex tint.
 * @param map Optional albedo map.
 * @param options Side only.
 * @returns Content view-lit material.
 */
export function createContentViewLitMaterial(
  color: number,
  map: THREE.Texture | null = null,
  options: { flatShading?: boolean; side?: THREE.Side } = {},
): ContentViewLitMaterial {
  if (options.side !== undefined) {
    return new ContentViewLitMaterial(color, map, { side: options.side });
  }
  return new ContentViewLitMaterial(color, map);
}
