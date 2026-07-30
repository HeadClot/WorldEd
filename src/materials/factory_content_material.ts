import * as THREE from 'three';
import { getDebugCheckerTexture } from '@/texture/library/factory_debug_texture.js';
import { getStudioMatcapTexture } from './factory_studio_matcap.js';

/**
 * Default metalness for export conversion of content materials to standard
 * materials.
 */
export const CONTENT_METALNESS = 0;

/**
 * Default roughness for export conversion of content materials to standard
 * materials.
 */
export const CONTENT_ROUGHNESS = 0.85;

/**
 * Creates a level-content material with the shared debug checker map and studio
 * matcap. Color tints the map; matcap provides solid-mode form without scene
 * lights.
 *
 * @param color Hex color tint.
 * @param options Optional side / flatShading overrides.
 * @returns Configured MeshMatcapMaterial.
 */
export function createContentMaterial(
  color: number,
  options: {
    flatShading?: boolean;
    side?: THREE.Side;
  } = {},
): THREE.MeshMatcapMaterial {
  const flatShading = options.flatShading !== false;
  const side = options.side ?? THREE.FrontSide;
  return new THREE.MeshMatcapMaterial({
    color,
    map: getDebugCheckerTexture(),
    matcap: getStudioMatcapTexture(),
    flatShading,
    side,
  });
}
