import * as THREE from 'three';
import type { AnisotropyPreference, TextureFilterMode } from '@/settings/store/settings_types.js';

/**
 * Runtime filter policy applied to content surface maps. Combines the user
 * preference with the GPU-reported maximum anisotropy.
 */
export interface PolicyTextureFilter {
  filterMode: TextureFilterMode;
  anisotropyPreference: AnisotropyPreference;
  maxAnisotropy: number;
}

/** Numeric levels for discrete anisotropy preferences. */
const ANISOTROPY_LEVEL_BY_PREFERENCE: Readonly<Record<Exclude<AnisotropyPreference, 'off' | 'max'>, number>> =
  Object.freeze({
    '2x': 2,
    '4x': 4,
    '8x': 8,
    '16x': 16,
  });

/**
 * Builds a filter policy from view preferences and a GPU max anisotropy.
 *
 * @param filterMode Texture sampling mode preference.
 * @param anisotropyPreference Anisotropic filtering preference.
 * @param maxAnisotropy GPU maximum from WebGL capabilities.
 * @returns Complete policy for configuring textures.
 */
export function createTextureFilterPolicy(
  filterMode: TextureFilterMode,
  anisotropyPreference: AnisotropyPreference,
  maxAnisotropy: number,
): PolicyTextureFilter {
  return {
    filterMode,
    anisotropyPreference,
    maxAnisotropy: sanitizeMaxAnisotropy(maxAnisotropy),
  };
}

/**
 * Resolves the effective anisotropy level for a policy.
 *
 * @param policy Filter policy including GPU max.
 * @returns Anisotropy level of at least 1.
 */
export function resolveAnisotropyLevel(policy: PolicyTextureFilter): number {
  if (policy.filterMode === 'point') {
    return 1;
  }
  return resolveAnisotropyPreference(policy.anisotropyPreference, policy.maxAnisotropy);
}

/**
 * Converts an anisotropy preference into a clamped numeric level.
 *
 * @param preference User anisotropy preference.
 * @param maxAnisotropy GPU maximum anisotropy.
 * @returns Level of at least 1 and at most maxAnisotropy.
 */
export function resolveAnisotropyPreference(preference: AnisotropyPreference, maxAnisotropy: number): number {
  const safeMax = sanitizeMaxAnisotropy(maxAnisotropy);
  if (preference === 'off') {
    return 1;
  }
  if (preference === 'max') {
    return safeMax;
  }
  const requested = ANISOTROPY_LEVEL_BY_PREFERENCE[preference];
  return Math.min(requested, safeMax);
}

/**
 * Applies wrap-independent filter and anisotropy settings to a content map.
 *
 * @param texture Texture to configure.
 * @param policy Active filter policy.
 */
export function applyTextureFilterPolicy(texture: THREE.Texture, policy: PolicyTextureFilter): void {
  applyFilterMode(texture, policy.filterMode);
  texture.anisotropy = resolveAnisotropyLevel(policy);
  texture.needsUpdate = true;
}

/**
 * Applies mag/min filters and mipmap generation for a sampling mode.
 *
 * @param texture Texture to configure.
 * @param filterMode Sampling mode preference.
 */
function applyFilterMode(texture: THREE.Texture, filterMode: TextureFilterMode): void {
  if (filterMode === 'point') {
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    return;
  }
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.minFilter = filterMode === 'bilinear' ? THREE.LinearMipmapNearestFilter : THREE.LinearMipmapLinearFilter;
}

/**
 * Ensures a GPU max anisotropy value is a positive integer.
 *
 * @param maxAnisotropy Candidate maximum.
 * @returns Safe maximum of at least 1.
 */
function sanitizeMaxAnisotropy(maxAnisotropy: number): number {
  if (!Number.isFinite(maxAnisotropy) || maxAnisotropy < 1) {
    return 1;
  }
  return Math.floor(maxAnisotropy);
}
