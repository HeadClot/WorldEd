import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  CONTENT_VIEW_LIT_AMBIENT,
  ContentViewLitMaterial,
  createContentViewLitMaterial,
  isContentViewLitMaterial,
} from '@/materials/factory_content_view_lit_material.js';

describe('content_view_lit_material', () => {
  it('uses distance-independent camera-locked studio lighting', () => {
    const material = createContentViewLitMaterial(0xffffff, null);
    expect(CONTENT_VIEW_LIT_AMBIENT).toBeCloseTo(0.18, 5);
    expect(material).toBeInstanceOf(ContentViewLitMaterial);
    expect(isContentViewLitMaterial(material)).toBe(true);
    expect(material.fragmentShader).toContain('studioViewportLuminance');
    expect(material.fragmentShader).toContain('keyDir');
    expect(material.fragmentShader).toContain('fillDir');
    expect(material.fragmentShader).toContain('headDir');
    expect(material.fragmentShader).not.toContain('1.0 / r2');
    expect(material.fragmentShader).not.toContain('cameraPosition');
    expect(material.vertexShader).toContain('normalMatrix');
    expect(material.vertexShader).toContain('vViewNormal');
    material.dispose();
  });

  it('writes linear lighting through linearToOutputTexel without a hand-rolled sRGB encode', () => {
    const material = createContentViewLitMaterial(0xffffff, null);
    expect(material.fragmentShader).toContain('linearToOutputTexel');
    expect(material.fragmentShader).toContain('linearColor');
    expect(material.fragmentShader).not.toContain('0.41666');
    expect(material.fragmentShader).not.toContain('12.92');
    expect(material.toneMapped).toBe(false);
    material.dispose();
  });

  it('keeps ambient above pure black so distant faces stay readable', () => {
    expect(CONTENT_VIEW_LIT_AMBIENT).toBeGreaterThan(0.1);
    expect(CONTENT_VIEW_LIT_AMBIENT).toBeLessThan(0.35);
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
