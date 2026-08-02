import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import {
  STUDIO_MATCAP_EDGE_FLOOR,
  STUDIO_MATCAP_PEAK,
  STUDIO_MATCAP_SIZE,
  bakeStudioMatcapTexture,
  disposeStudioMatcapTexture,
  getStudioMatcapTexture,
  matcapUvToViewNormal,
  sampleStudioMatcapLighting,
} from '@/materials/factory_studio_matcap.js';

describe('studio_matcap_factory', () => {
  afterEach(() => {
    disposeStudioMatcapTexture();
  });

  it('bakes a square matcap at the configured resolution', () => {
    const texture = bakeStudioMatcapTexture(64);
    expect(texture).toBeInstanceOf(THREE.DataTexture);
    const image = texture.image as { width: number; height: number; data: Uint8Array };
    expect(image.width).toBe(64);
    expect(image.height).toBe(64);
    expect(STUDIO_MATCAP_SIZE).toBeGreaterThanOrEqual(128);
    texture.dispose();
  });

  it('caps peak luminance so white albedo cannot exceed unlit full-bright', () => {
    expect(STUDIO_MATCAP_PEAK).toBeLessThanOrEqual(1);
    expect(STUDIO_MATCAP_PEAK).toBeGreaterThan(0.7);
  });

  it('returns a shared texture instance across callers', () => {
    const first = getStudioMatcapTexture();
    const second = getStudioMatcapTexture();
    expect(first).toBe(second);
  });

  it('maps matcap UV center to face-on view normal (Three.js convention)', () => {
    const normal = matcapUvToViewNormal(0.5, 0.5);
    expect(normal).not.toBeNull();
    expect(normal!.x).toBeCloseTo(0, 5);
    expect(normal!.y).toBeCloseTo(0, 5);
    expect(normal!.z).toBeCloseTo(1, 5);
  });

  it('maps matcap UV right edge to +X (matches Three.js uv = n.xy * 0.495 + 0.5)', () => {
    const normal = matcapUvToViewNormal(0.5 + 0.495, 0.5);
    expect(normal).not.toBeNull();
    expect(normal!.x).toBeCloseTo(1, 3);
    expect(Math.abs(normal!.y)).toBeLessThan(0.05);
  });

  it('face-on normals are near unlit peak so wall textures keep true color', () => {
    const faceOn = sampleStudioMatcapLighting(0, 0, 1);
    const faceOnLuma = averageChannel(faceOn);
    expect(faceOnLuma).toBeGreaterThan(0.97);
    expect(faceOnLuma).toBeLessThanOrEqual(STUDIO_MATCAP_PEAK + 0.001);
    expect(Math.abs(faceOn.r - faceOn.g)).toBeLessThan(0.02);
    expect(Math.abs(faceOn.g - faceOn.b)).toBeLessThan(0.02);
  });

  it('darkens grazing side normals much more than face-on (form falloff)', () => {
    const faceOn = averageChannel(sampleStudioMatcapLighting(0, 0, 1));
    const side = averageChannel(sampleStudioMatcapLighting(1, 0, 0));
    expect(side).toBeLessThan(faceOn * 0.45);
    expect(side).toBeLessThan(0.35);
    expect(STUDIO_MATCAP_EDGE_FLOOR).toBeLessThan(0.2);
  });

  it('keeps intermediate angles sculpted so iso views show depth', () => {
    const faceOn = averageChannel(sampleStudioMatcapLighting(0, 0, 1));
    const length = Math.hypot(0.65, 0.35, 0.68);
    const angled = averageChannel(sampleStudioMatcapLighting(0.65 / length, 0.35 / length, 0.68 / length));
    const side = averageChannel(sampleStudioMatcapLighting(1, 0, 0));
    expect(angled).toBeLessThan(faceOn * 0.95);
    expect(angled).toBeGreaterThan(side * 0.8);
  });

  it('center texel of the baked texture is bright (face-on sample)', () => {
    const size = 64;
    const texture = bakeStudioMatcapTexture(size);
    const image = texture.image as { width: number; height: number; data: Uint8Array };
    const mid = Math.floor(size / 2);
    const centerLuma = readPixelLuma(image.data, size, mid, mid);
    const outsideLuma = readPixelLuma(image.data, size, 1, 1);
    expect(centerLuma).toBeGreaterThan(220 * 3);
    expect(centerLuma).toBeGreaterThan(outsideLuma * 2);
    texture.dispose();
  });
});

/**
 * Averages RGB channels of a lighting sample.
 *
 * @param rgb Linear RGB sample.
 * @returns Mean channel value.
 */
function averageChannel(rgb: { r: number; g: number; b: number }): number {
  return (rgb.r + rgb.g + rgb.b) / 3;
}

/**
 * Reads grayscale luma from a packed RGBA buffer.
 *
 * @param data RGBA bytes.
 * @param size Texture edge length.
 * @param x Column.
 * @param y Row.
 * @returns Sum of RGB channels.
 */
function readPixelLuma(data: Uint8Array, size: number, x: number, y: number): number {
  const index = (y * size + x) * 4;
  return (data[index] ?? 0) + (data[index + 1] ?? 0) + (data[index + 2] ?? 0);
}
