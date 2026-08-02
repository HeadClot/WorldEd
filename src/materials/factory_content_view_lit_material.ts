import * as THREE from 'three';

/**
 * Soft ambient floor so silhouettes and backfaces stay readable at any
 * distance. Matches typical editor viewport fill (not physical night-black).
 */
export const CONTENT_VIEW_LIT_AMBIENT = 0.18;

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
 * Builds the GLSL fragment shader for distance-independent viewport lighting.
 * Albedo is sampled in working (linear) space from sRGB textures; output uses
 * Three.js linearToOutputTexel so the renderer color pipeline is not
 * double-encoded.
 *
 * @returns Fragment shader source.
 */
function buildContentViewLitFragmentShader(): string {
  return /* glsl */ `
		uniform vec3 diffuse;
		uniform sampler2D map;
		varying vec3 vViewNormal;
		varying vec2 vUv;

		float lambertTerm(vec3 normalUnit, vec3 lightUnit) {
			return max(dot(normalUnit, lightUnit), 0.0);
		}

		float studioViewportLuminance(vec3 normalUnit) {
			vec3 keyDir = normalize(vec3(0.45, 0.55, 0.70));
			vec3 fillDir = normalize(vec3(-0.55, 0.28, 0.55));
			vec3 topDir = normalize(vec3(0.08, 0.88, 0.40));
			vec3 headDir = vec3(0.0, 0.0, 1.0);
			float key = lambertTerm(normalUnit, keyDir) * 0.48;
			float fill = lambertTerm(normalUnit, fillDir) * 0.22;
			float top = lambertTerm(normalUnit, topDir) * 0.12;
			float head = lambertTerm(normalUnit, headDir) * 0.20;
			return min(${CONTENT_VIEW_LIT_AMBIENT.toFixed(3)} + key + fill + top + head, 1.0);
		}

		void main() {
			vec3 normalUnit = normalize(vViewNormal);
			float lit = studioViewportLuminance(normalUnit);
			vec3 linearColor = lit * texture2D(map, vUv).rgb * diffuse;
			gl_FragColor = linearToOutputTexel(vec4(linearColor, 1.0));
		}
	`;
}

/**
 * Builds the GLSL vertex shader that passes view-space normals.
 *
 * @returns Vertex shader source.
 */
function buildContentViewLitVertexShader(): string {
  return /* glsl */ `
		varying vec3 vViewNormal;
		varying vec2 vUv;
		void main() {
			vUv = uv;
			vViewNormal = normalize(normalMatrix * normal);
			gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		}
	`;
}

/**
 * Content material with camera-locked studio viewport lighting: lit =
 * min(ambient + key + fill + top + head, 1) * map * color Lights live in view
 * space so they follow the camera. No distance falloff — near and far keep
 * equal form contrast (editor solid / scene-view style).
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
    super({
      lights: false,
      toneMapped: false,
      side: options.side ?? THREE.FrontSide,
      uniforms: {
        diffuse: { value: tint },
        map: { value: resolvedMap },
      },
      vertexShader: buildContentViewLitVertexShader(),
      fragmentShader: buildContentViewLitFragmentShader(),
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
