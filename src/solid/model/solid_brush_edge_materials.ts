import * as THREE from 'three';
import { SolidOperation } from '../types/solid_operation.js';

/**
 * UserData flag marking a shared brush edge material (must not be disposed per
 * mesh).
 */
export const BRUSH_EDGE_SHARED_MATERIAL_KEY = 'isSharedBrushEdgeMaterial';

/**
 * UserData flag marking operation-colored dual-pass edges on solid brush
 * previews. Distinct from content decorative edges (white Theme.boxEdgeColor
 * outlines).
 */
export const SOLID_BRUSH_EDGE_USERDATA_KEY = 'isSolidBrushEdge';

/** UserData flag marking materials that support distance fade uniforms. */
export const BRUSH_EDGE_DISTANCE_FADE_KEY = 'brushEdgeDistanceFade';

/** Distance where brush edges begin fading out in the perspective viewport. */
export const BRUSH_EDGE_FADE_NEAR = 28;

/**
 * Distance where brush edges are fully faded and culled in the perspective
 * viewport.
 */
export const BRUSH_EDGE_FADE_FAR = 85;

/** Front-pass opacity for unoccluded brush edges. */
export const BRUSH_EDGE_FRONT_OPACITY = 0.88;

/** Occluded-pass opacity for edges behind solid geometry (dim ghost). */
export const BRUSH_EDGE_OCCLUDED_OPACITY = 0.14;

/** Near/far values that effectively disable distance fade (2D clones, tests). */
const FADE_DISABLED_NEAR = 1e7;

/** Far plane for disabled distance fade. */
const FADE_DISABLED_FAR = 1e8;

/** Vertex shader: projects line verts and computes distance fade factor. */
const EDGE_VERTEX_SHADER = `
  uniform float fadeNear;
  uniform float fadeFar;
  varying float vFade;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float distanceFromCamera = length(mvPosition.xyz);
    vFade = 1.0 - smoothstep(fadeNear, fadeFar, distanceFromCamera);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

/**
 * Fragment shader: multiplies operation color by distance fade and base
 * opacity.
 */
const EDGE_FRAGMENT_SHADER = `
  uniform vec3 diffuse;
  uniform float opacity;
  varying float vFade;

  void main() {
    float alpha = opacity * vFade;
    if (alpha < 0.012) discard;
    gl_FragColor = vec4(diffuse, alpha);
  }
`;

/**
 * Shared dual-pass brush edge materials with distance fade for the 3D viewport.
 * One front and one occluded material exist per CSG operation color.
 */
export class SolidBrushEdgeMaterials {
  private static frontByOperation = new Map<SolidOperation, THREE.ShaderMaterial>();
  private static occludedByOperation = new Map<SolidOperation, THREE.ShaderMaterial>();

  /**
   * Returns the shared front-pass edge material for a CSG operation.
   *
   * @param operation Brush CSG operation.
   * @returns Shared front edge material.
   */
  static getFrontMaterial(operation: SolidOperation): THREE.ShaderMaterial {
    return this.getOrCreate(this.frontByOperation, operation, BRUSH_EDGE_FRONT_OPACITY, THREE.LessEqualDepth);
  }

  /**
   * Returns the shared occluded-pass edge material for a CSG operation.
   *
   * @param operation Brush CSG operation.
   * @returns Shared occluded edge material.
   */
  static getOccludedMaterial(operation: SolidOperation): THREE.ShaderMaterial {
    return this.getOrCreate(this.occludedByOperation, operation, BRUSH_EDGE_OCCLUDED_OPACITY, THREE.GreaterDepth);
  }

  /**
   * Returns whether a material is a shared brush edge material.
   *
   * @param material Candidate material.
   * @returns True when dispose paths must skip this material.
   */
  static isSharedMaterial(material: THREE.Material): boolean {
    return material.userData[BRUSH_EDGE_SHARED_MATERIAL_KEY] === true;
  }

  /**
   * Disables distance fade on a material (used for 2D viewport clones).
   *
   * @param material Line material after clone.
   */
  static disableDistanceFade(material: THREE.Material): void {
    if (material.userData[BRUSH_EDGE_DISTANCE_FADE_KEY] !== true) return;
    if (!(material instanceof THREE.ShaderMaterial)) return;
    const fadeNear = material.uniforms['fadeNear'];
    const fadeFar = material.uniforms['fadeFar'];
    if (fadeNear) fadeNear.value = FADE_DISABLED_NEAR;
    if (fadeFar) fadeFar.value = FADE_DISABLED_FAR;
  }

  /**
   * Prepares a cloned brush edge material for orthographic 2D viewports.
   * Disables distance fade and depth testing so outlines stay visible from
   * every axis (side/top/front) even when solid result depth would hide them.
   *
   * @param material Line material after clone.
   */
  static prepareForOrthoClone(material: THREE.Material): void {
    this.disableDistanceFade(material);
    if (material.userData[BRUSH_EDGE_DISTANCE_FADE_KEY] !== true) return;
    material.depthTest = false;
    material.depthWrite = false;
    material.depthFunc = THREE.AlwaysDepth;
    material.needsUpdate = true;
  }

  /**
   * Preview edge color for a CSG operation.
   *
   * @param operation Solid operation.
   * @returns Hex color.
   */
  static edgeColorForOperation(operation: SolidOperation): number {
    if (operation === SolidOperation.Subtractive) return 0xff6b5a;
    if (operation === SolidOperation.Intersecting) return 0x5dade2;
    return 0x58d68d;
  }

  /**
   * Gets or creates a shared edge material for an operation and depth mode.
   *
   * @param cache Material map keyed by operation.
   * @param operation CSG operation.
   * @param opacity Base opacity before distance fade.
   * @param depthFunc Depth comparison function.
   * @returns Shared shader material.
   */
  private static getOrCreate(
    cache: Map<SolidOperation, THREE.ShaderMaterial>,
    operation: SolidOperation,
    opacity: number,
    depthFunc: THREE.DepthModes,
  ): THREE.ShaderMaterial {
    const existing = cache.get(operation);
    if (existing) return existing;
    const material = this.createMaterial(operation, opacity, depthFunc);
    cache.set(operation, material);
    return material;
  }

  /**
   * Builds one shared distance-faded edge material.
   *
   * @param operation CSG operation for tint.
   * @param opacity Base opacity.
   * @param depthFunc Depth function for front or occluded pass.
   * @returns Configured shader material.
   */
  private static createMaterial(
    operation: SolidOperation,
    opacity: number,
    depthFunc: THREE.DepthModes,
  ): THREE.ShaderMaterial {
    const color = new THREE.Color(this.edgeColorForOperation(operation));
    const material = new THREE.ShaderMaterial({
      uniforms: {
        diffuse: { value: color },
        opacity: { value: opacity },
        fadeNear: { value: BRUSH_EDGE_FADE_NEAR },
        fadeFar: { value: BRUSH_EDGE_FADE_FAR },
      },
      vertexShader: EDGE_VERTEX_SHADER,
      fragmentShader: EDGE_FRAGMENT_SHADER,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      depthFunc,
      toneMapped: false,
    });
    material.userData[BRUSH_EDGE_SHARED_MATERIAL_KEY] = true;
    material.userData[BRUSH_EDGE_DISTANCE_FADE_KEY] = true;
    return material;
  }
}
