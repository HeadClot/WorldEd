import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import {
  getDebugCheckerTexture,
  disposeDebugCheckerTexture,
  getDebugCheckerCellCount,
  getDebugCheckerTexturePixelSize,
  isDefaultSurfaceTexture,
} from '@/texture/library/factory_debug_texture.js';

describe('debug_texture_factory', () => {
  afterEach(() => {
    disposeDebugCheckerTexture();
  });

  it('should return a shared canvas texture', () => {
    const a = getDebugCheckerTexture();
    const b = getDebugCheckerTexture();
    expect(a).toBe(b);
    expect(a).toBeInstanceOf(THREE.CanvasTexture);
    expect(isDefaultSurfaceTexture(a)).toBe(true);
  });

  it('should default to repeat wrap and trilinear-style filtering', () => {
    const texture = getDebugCheckerTexture();
    expect(texture.wrapS).toBe(THREE.RepeatWrapping);
    expect(texture.wrapT).toBe(THREE.RepeatWrapping);
    expect(texture.magFilter).toBe(THREE.LinearFilter);
    expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(texture.generateMipmaps).toBe(true);
  });

  it('should use a 4x4 checker cell layout at high resolution', () => {
    expect(getDebugCheckerCellCount()).toBe(4);
    expect(getDebugCheckerTexturePixelSize()).toBe(512);
  });
});
