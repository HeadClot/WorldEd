import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  CONTENT_VIEW_LIT_AMBIENT,
  ContentViewLitMaterial,
  createContentViewLitMaterial,
  isContentViewLitMaterial,
} from '@/materials/factory_content_view_lit_material.js';

describe('content_view_lit_material', () => {
  it('uses distance-independent studio lighting and embeds the projected grid', () => {
    const material = createContentViewLitMaterial(0xffffff, null);
    expect(CONTENT_VIEW_LIT_AMBIENT).toBeCloseTo(0.18, 5);
    expect(material).toBeInstanceOf(ContentViewLitMaterial);
    expect(isContentViewLitMaterial(material)).toBe(true);
    expect(material.fragmentShader).toContain('studioViewportLuminance');
    expect(material.fragmentShader).not.toContain('1.0 / r2');
    expect(material.fragmentShader).toContain('evaluateProjectedGridLineColor');
    expect(material.fragmentShader).toContain('linearToOutputTexel');
    expect(material.fragmentShader.split('linearToOutputTexel').length - 1).toBe(1);
    expect(material.uniforms['projectedGridEnabled']).toBeDefined();
    expect(material.toneMapped).toBe(false);
    material.dispose();
  });

  it('swaps the map uniform when map is set', () => {
    const texture = new THREE.Texture();
    const material = new ContentViewLitMaterial(0xcccccc, null);
    material.map = texture;
    expect(material.map).toBe(texture);
    expect(material.uniforms['map']?.value).toBe(texture);
    material.dispose();
    texture.dispose();
  });
});
