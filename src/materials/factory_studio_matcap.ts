import * as THREE from 'three';

/** Resolution of the baked studio matcap sphere. */
export const STUDIO_MATCAP_SIZE = 256;

/**
 * Peak matcap luminance for camera-facing surfaces. Kept under 1 so white
 * albedo never exceeds unlit full-bright.
 */
export const STUDIO_MATCAP_PEAK = 0.9;

/**
 * Floor luminance for grazing silhouette normals. Low values make steep sides
 * dark relative to faces aimed at the camera.
 */
export const STUDIO_MATCAP_EDGE_FLOOR = 0.09;

/** Shared matcap texture used by all solid content materials. */
let sharedStudioMatcap: THREE.DataTexture | null = null;

/**
 * Returns the shared studio matcap texture, baking it on first use.
 *
 * @returns Matcap DataTexture in sRGB color space.
 */
export function getStudioMatcapTexture(): THREE.DataTexture {
  if (!sharedStudioMatcap) {
    sharedStudioMatcap = bakeStudioMatcapTexture(STUDIO_MATCAP_SIZE);
  }
  return sharedStudioMatcap;
}

/** Disposes the shared matcap texture when tests tear down. */
export function disposeStudioMatcapTexture(): void {
  if (!sharedStudioMatcap) return;
  sharedStudioMatcap.dispose();
  sharedStudioMatcap = null;
}

/**
 * Bakes a studio lighting sphere into a matcap texture for MeshMatcapMaterial.
 *
 * @param size Texture width and height in pixels.
 * @returns Configured DataTexture.
 */
export function bakeStudioMatcapTexture(size: number): THREE.DataTexture {
  const pixels = new Uint8Array(size * size * 4);
  fillStudioMatcapPixels(pixels, size);
  return createMatcapDataTexture(pixels, size);
}

/**
 * Evaluates studio lighting for a unit normal. Exposed for unit tests.
 *
 * @param normalX View-space normal X.
 * @param normalY View-space normal Y.
 * @param normalZ View-space normal Z.
 * @returns Linear RGB in 0..peak.
 */
export function sampleStudioMatcapLighting(
  normalX: number,
  normalY: number,
  normalZ: number,
): { r: number; g: number; b: number } {
  return evaluateStudioSphereLighting(normalX, normalY, normalZ);
}

/**
 * Writes studio-lit sphere samples into an RGBA pixel buffer.
 *
 * @param pixels Raw RGBA bytes.
 * @param size Texture edge length.
 */
function fillStudioMatcapPixels(pixels: Uint8Array, size: number): void {
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      writeStudioMatcapPixel(pixels, size, x, y);
    }
  }
}

/**
 * Writes one matcap texel for Three.js MeshMatcapMaterial UV mapping.
 *
 * @param pixels Raw RGBA bytes.
 * @param size Texture edge length.
 * @param x Pixel column.
 * @param y Pixel row.
 */
function writeStudioMatcapPixel(pixels: Uint8Array, size: number, x: number, y: number): void {
  const index = (y * size + x) * 4;
  const normalX = mapMatcapTexelToNormalX(x, size);
  const normalY = mapMatcapTexelToNormalY(y, size);
  const radiusSquared = normalX * normalX + normalY * normalY;
  if (radiusSquared > 1) {
    writeOutsideSpherePixel(pixels, index);
    return;
  }
  const normalZ = Math.sqrt(Math.max(0, 1 - radiusSquared));
  const rgb = evaluateStudioSphereLighting(normalX, normalY, normalZ);
  pixels[index] = linearChannelToByte(rgb.r);
  pixels[index + 1] = linearChannelToByte(rgb.g);
  pixels[index + 2] = linearChannelToByte(rgb.b);
  pixels[index + 3] = 255;
}

/**
 * Maps a matcap texel column to view-space normal X for Three.js sampling.
 *
 * @param x Pixel column.
 * @param size Texture edge length.
 * @returns Normal X in -1..1.
 */
function mapMatcapTexelToNormalX(x: number, size: number): number {
  return 1 - (x / (size - 1)) * 2;
}

/**
 * Maps a matcap texel row to view-space normal Y for Three.js sampling.
 *
 * @param y Pixel row.
 * @param size Texture edge length.
 * @returns Normal Y in -1..1.
 */
function mapMatcapTexelToNormalY(y: number, size: number): number {
  return (y / (size - 1)) * 2 - 1;
}

/**
 * Fills texels outside the matcap sphere with a dark neutral.
 *
 * @param pixels Raw RGBA bytes.
 * @param index RGBA start index.
 */
function writeOutsideSpherePixel(pixels: Uint8Array, index: number): void {
  pixels[index] = 18;
  pixels[index + 1] = 18;
  pixels[index + 2] = 22;
  pixels[index + 3] = 255;
}

/**
 * Evaluates studio matcap lighting for a unit sphere normal. Brightness follows
 * how much the normal faces the camera so steep sides fall off while face-on
 * surfaces stay readable.
 *
 * @param normalX View-space normal X.
 * @param normalY View-space normal Y.
 * @param normalZ View-space normal Z toward the camera at sphere center.
 * @returns Linear RGB in 0..peak.
 */
function evaluateStudioSphereLighting(
  normalX: number,
  normalY: number,
  normalZ: number,
): { r: number; g: number; b: number } {
  const facingAmount = Math.max(0, normalZ);
  const facingCurve = Math.pow(facingAmount, 1.65);
  const coreLighting = facingCurve * 0.78;
  const keyLighting = clampedLambert(normalX, normalY, normalZ, 0.35, 0.72, 0.55) * 0.14 * (0.25 + 0.75 * facingCurve);
  const limbDarkening = Math.pow(1 - facingAmount, 1.25) * 0.04;
  const ambientLighting = STUDIO_MATCAP_EDGE_FLOOR + (normalY * 0.5 + 0.5) * 0.025;
  const luminance = Math.min(
    STUDIO_MATCAP_PEAK,
    Math.max(0, coreLighting + keyLighting + ambientLighting - limbDarkening),
  );
  return tintStudioLuminance(luminance, keyLighting);
}

/**
 * Applies a slight warm key tint to the matcap luminance.
 *
 * @param luminance Combined lighting term.
 * @param keyLighting Key contribution for warmth.
 * @returns Tinted RGB.
 */
function tintStudioLuminance(luminance: number, keyLighting: number): { r: number; g: number; b: number } {
  const warmthAmount = Math.min(1, keyLighting * 4);
  return {
    r: Math.min(STUDIO_MATCAP_PEAK, Math.max(0, luminance * (1 + warmthAmount * 0.04))),
    g: Math.min(STUDIO_MATCAP_PEAK, Math.max(0, luminance * (1 + warmthAmount * 0.015))),
    b: Math.min(STUDIO_MATCAP_PEAK, Math.max(0, luminance * (1 - warmthAmount * 0.03))),
  };
}

/**
 * Clamped Lambert term for the studio key contribution.
 *
 * @param normalX Normal X.
 * @param normalY Normal Y.
 * @param normalZ Normal Z.
 * @param lightX Light direction X.
 * @param lightY Light direction Y.
 * @param lightZ Light direction Z.
 * @returns Clamped N·L in 0..1.
 */
function clampedLambert(
  normalX: number,
  normalY: number,
  normalZ: number,
  lightX: number,
  lightY: number,
  lightZ: number,
): number {
  const lightLength = Math.hypot(lightX, lightY, lightZ) || 1;
  const normalizedLightX = lightX / lightLength;
  const normalizedLightY = lightY / lightLength;
  const normalizedLightZ = lightZ / lightLength;
  return Math.max(0, normalX * normalizedLightX + normalY * normalizedLightY + normalZ * normalizedLightZ);
}

/**
 * Converts a linear 0..1 channel to an 8-bit gamma-encoded byte.
 *
 * @param channel Linear channel.
 * @returns Byte 0..255.
 */
function linearChannelToByte(channel: number): number {
  const gammaEncoded = Math.pow(Math.min(1, Math.max(0, channel)), 1 / 2.2);
  return Math.round(gammaEncoded * 255);
}

/**
 * Wraps baked RGBA bytes as a Three.js matcap DataTexture.
 *
 * @param pixels Raw RGBA bytes.
 * @param size Texture edge length.
 * @returns DataTexture configured for MeshMatcapMaterial.
 */
function createMatcapDataTexture(pixels: Uint8Array, size: number): THREE.DataTexture {
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.flipY = false;
  texture.needsUpdate = true;
  texture.name = 'studio_matcap';
  return texture;
}
