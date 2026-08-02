import { describe, it, expect, afterEach } from 'vitest';
import { CONTENT_METALNESS, CONTENT_ROUGHNESS, createContentMaterial } from '@/materials/factory_content_material.js';
import { ContentViewLitMaterial } from '@/materials/factory_content_view_lit_material.js';
import { disposeDebugCheckerTexture } from '@/texture/library/factory_debug_texture.js';

describe('content_material_factory', () => {
  afterEach(() => {
    disposeDebugCheckerTexture();
  });

  it('should create a view-lit material with the shared debug map', () => {
    const material = createContentMaterial(0xff0000);
    expect(material).toBeInstanceOf(ContentViewLitMaterial);
    expect(material.map).not.toBeNull();
    expect(material.color.getHex()).toBe(0xff0000);
    expect(material.fragmentShader).toContain('studioViewportLuminance');
    expect(material.fragmentShader).not.toContain('1.0 / r2');
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
