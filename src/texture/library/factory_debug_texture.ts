import * as THREE from 'three';

/**
 * Shared 4x4 checker debug texture for level surfaces. At scale 1, one tile is
 * 1 m and each cell is 0.25 m (default snap).
 */
const CHECKER_CELLS = 4;

/**
 * Texture edge length in pixels. Same 4×4 pattern as the original 64px map;
 * higher resolution keeps hard cell edges crisp under trilinear / anisotropy.
 */
const TEXTURE_PIXELS = 512;

/** UserData key marking the shared built-in default surface map. */
export const DEFAULT_SURFACE_TEXTURE_USERDATA_KEY = 'isDefaultSurfaceTexture';

let sharedDebugTexture: THREE.CanvasTexture | null = null;

/**
 * Returns the singleton debug checker texture, creating it on first use. Do not
 * dispose this texture per mesh; dispose only on app teardown.
 *
 * @returns Shared canvas texture with repeat wrapping.
 */
export function getDebugCheckerTexture(): THREE.CanvasTexture {
  if (sharedDebugTexture) {
    return sharedDebugTexture;
  }
  sharedDebugTexture = createCheckerTexture();
  return sharedDebugTexture;
}

/**
 * Builds a new 4x4 white/gray checker canvas texture.
 *
 * @returns Configured CanvasTexture.
 */
function createCheckerTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_PIXELS;
  canvas.height = TEXTURE_PIXELS;
  const context = canvas.getContext('2d');
  if (!context) {
    return createFallbackDataTexture();
  }
  paintChecker(context, TEXTURE_PIXELS, CHECKER_CELLS);
  const texture = new THREE.CanvasTexture(canvas);
  configureTexture(texture);
  return texture;
}

/**
 * Paints alternating light cells into a 2D canvas context.
 *
 * @param context Canvas 2D context.
 * @param pixelSize Texture edge length in pixels.
 * @param cellCount Number of cells along each edge.
 */
function paintChecker(context: CanvasRenderingContext2D, pixelSize: number, cellCount: number): void {
  const cellPixels = pixelSize / cellCount;
  for (let y = 0; y < cellCount; y++) {
    for (let x = 0; x < cellCount; x++) {
      const isLight = (x + y) % 2 === 0;
      context.fillStyle = isLight ? '#e8e8e8' : '#9a9a9a';
      context.fillRect(x * cellPixels, y * cellPixels, cellPixels, cellPixels);
    }
  }
}

/**
 * Fallback texture when canvas 2D is unavailable (tests without full DOM
 * canvas).
 *
 * @returns CanvasTexture with a simple 2x2 checker pattern.
 */
function createFallbackDataTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = '#e8e8e8';
    context.fillRect(0, 0, 1, 1);
    context.fillRect(1, 1, 1, 1);
    context.fillStyle = '#9a9a9a';
    context.fillRect(1, 0, 1, 1);
    context.fillRect(0, 1, 1, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  configureTexture(texture);
  return texture;
}

/**
 * Applies wrap and color-space defaults for the debug map. Mag/min filters and
 * anisotropy come from the global texture filter policy via
 * TextureMapCache.setFilterPolicy; defaults match trilinear until then.
 *
 * @param texture Texture to configure.
 */
function configureTexture(texture: THREE.CanvasTexture): void {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.name = 'default_surface_grid';
  texture.userData[DEFAULT_SURFACE_TEXTURE_USERDATA_KEY] = true;
  texture.needsUpdate = true;
}

/**
 * Returns true when the texture is the shared built-in default surface map.
 *
 * @param texture Candidate texture.
 * @returns True for the built-in debug checker.
 */
export function isDefaultSurfaceTexture(texture: THREE.Texture | null | undefined): boolean {
  if (!texture) {
    return false;
  }
  if (texture === sharedDebugTexture) {
    return true;
  }
  return texture.userData[DEFAULT_SURFACE_TEXTURE_USERDATA_KEY] === true;
}

/**
 * Disposes the shared debug texture if it exists. Call only when the
 * application is shutting down.
 */
export function disposeDebugCheckerTexture(): void {
  if (!sharedDebugTexture) {
    return;
  }
  sharedDebugTexture.dispose();
  sharedDebugTexture = null;
}

/**
 * Returns the designed cell count along one edge of the checker.
 *
 * @returns Cell count (4).
 */
export function getDebugCheckerCellCount(): number {
  return CHECKER_CELLS;
}

/**
 * Returns the texture edge length in pixels for the built-in checker.
 *
 * @returns Pixel size along one edge.
 */
export function getDebugCheckerTexturePixelSize(): number {
  return TEXTURE_PIXELS;
}
