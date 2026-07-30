import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  applyTextureFilterPolicy,
  createTextureFilterPolicy,
  resolveAnisotropyLevel,
  resolveAnisotropyPreference,
} from '@/texture/library/policy_texture_filter.js';

describe('texture_filter_policy', () => {
  it('resolves discrete anisotropy levels clamped to the GPU maximum', () => {
    expect(resolveAnisotropyPreference('off', 16)).toBe(1);
    expect(resolveAnisotropyPreference('2x', 16)).toBe(2);
    expect(resolveAnisotropyPreference('16x', 8)).toBe(8);
    expect(resolveAnisotropyPreference('max', 12)).toBe(12);
    expect(resolveAnisotropyPreference('max', 0)).toBe(1);
  });

  it('forces anisotropy off for point sampling even when maximum is preferred', () => {
    const policy = createTextureFilterPolicy('point', 'max', 16);
    expect(resolveAnisotropyLevel(policy)).toBe(1);
  });

  it('applies trilinear filtering with maximum anisotropy by default policy shape', () => {
    const texture = new THREE.Texture();
    const policy = createTextureFilterPolicy('trilinear', 'max', 16);
    applyTextureFilterPolicy(texture, policy);
    expect(texture.magFilter).toBe(THREE.LinearFilter);
    expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(texture.generateMipmaps).toBe(true);
    expect(texture.anisotropy).toBe(16);
  });

  it('applies bilinear mipmap filtering when requested', () => {
    const texture = new THREE.Texture();
    applyTextureFilterPolicy(texture, createTextureFilterPolicy('bilinear', '4x', 16));
    expect(texture.magFilter).toBe(THREE.LinearFilter);
    expect(texture.minFilter).toBe(THREE.LinearMipmapNearestFilter);
    expect(texture.generateMipmaps).toBe(true);
    expect(texture.anisotropy).toBe(4);
  });

  it('applies point sampling without mipmaps', () => {
    const texture = new THREE.Texture();
    applyTextureFilterPolicy(texture, createTextureFilterPolicy('point', '16x', 16));
    expect(texture.magFilter).toBe(THREE.NearestFilter);
    expect(texture.minFilter).toBe(THREE.NearestFilter);
    expect(texture.generateMipmaps).toBe(false);
    expect(texture.anisotropy).toBe(1);
  });
});
