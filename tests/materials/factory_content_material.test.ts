import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import { CONTENT_METALNESS, CONTENT_ROUGHNESS, createContentMaterial } from '@/materials/factory_content_material.js';
import { disposeDebugCheckerTexture } from '@/texture/library/factory_debug_texture.js';
import { disposeStudioMatcapTexture } from '@/materials/factory_studio_matcap.js';

describe('content_material_factory', () => {
  afterEach(() => {
    disposeDebugCheckerTexture();
    disposeStudioMatcapTexture();
  });

  it('should create a matcap material with the shared debug map', () => {
    const material = createContentMaterial(0xff0000);
    expect(material).toBeInstanceOf(THREE.MeshMatcapMaterial);
    expect(material.map).not.toBeNull();
    expect(material.matcap).not.toBeNull();
    expect(material.color.getHex()).toBe(0xff0000);
    material.dispose();
  });

  it('should default to flat shading for hard-edge level geometry', () => {
    const material = createContentMaterial(0x888888);
    expect(material.flatShading).toBe(true);
    material.dispose();
  });

  it('should expose non-metallic export defaults', () => {
    expect(CONTENT_METALNESS).toBe(0);
    expect(CONTENT_ROUGHNESS).toBeGreaterThan(0);
    expect(CONTENT_ROUGHNESS).toBeLessThanOrEqual(1);
  });
});
