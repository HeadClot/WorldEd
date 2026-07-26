import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import {
  STUDIO_MATCAP_EDGE_FLOOR,
  STUDIO_MATCAP_PEAK,
  STUDIO_MATCAP_SIZE,
  bakeStudioMatcapTexture,
  disposeStudioMatcapTexture,
  getStudioMatcapTexture,
  sampleStudioMatcapLighting,
} from '../../src/materials/studio_matcap_factory.js';

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

  it('matches face-on brightness for pure camera-facing normals', () => {
    const faceOn = sampleStudioMatcapLighting(0, 0, 1);
    const faceOnLuma = averageChannel(faceOn);
    expect(faceOnLuma).toBeGreaterThan(0.7);
    expect(faceOnLuma).toBeLessThanOrEqual(STUDIO_MATCAP_PEAK + 0.001);
  });

  it('darkens grazing side normals much more than face-on (Blender-like limbs)', () => {
    const faceOn = averageChannel(sampleStudioMatcapLighting(0, 0, 1));
    const side = averageChannel(sampleStudioMatcapLighting(1, 0, 0));
    expect(side).toBeLessThan(faceOn * 0.35);
    expect(side).toBeLessThan(0.25);
    expect(STUDIO_MATCAP_EDGE_FLOOR).toBeLessThan(0.15);
  });

  it('stores camera-up limb samples at the top of the DataTexture (high y)', () => {
    const size = 64;
    const texture = bakeStudioMatcapTexture(size);
    const image = texture.image as { width: number; height: number; data: Uint8Array };
    const data = image.data;
    const topCenter = readPixelLuma(data, size, Math.floor(size / 2), size - 2);
    const bottomCenter = readPixelLuma(data, size, Math.floor(size / 2), 1);
    expect(topCenter).toBeGreaterThanOrEqual(bottomCenter * 0.9);
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
