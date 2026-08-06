import * as THREE from 'three';
import { Theme } from '@/theme.js';
import type { EditorPlaneFrame } from '@/navigation/orientation/editor_orientation_basis.js';
import { buildDefaultPlaneFrame } from '@/navigation/orientation/editor_orientation_basis.js';

/** Default number of minor cells between stronger section lines. */
export const PROJECTED_GRID_SECTION_EVERY = 4;

/** Default number of minor cells between strongest major lines. */
export const PROJECTED_GRID_MAJOR_EVERY = 8;

/** Shared projected-grid uniform bag used by every content material instance. */
let sharedProjectedGridUniforms: Record<string, THREE.IUniform> | null = null;

/** Last visibility requested by a multi-view prepare pass. */
let sharedProjectedGridVisible = true;

/**
 * Returns the shared projected-grid uniform objects. All content materials that
 * include the grid chunk must reference these same objects.
 *
 * @returns Shared uniform dictionary.
 */
export function getSharedProjectedGridUniforms(): Record<string, THREE.IUniform> {
  if (!sharedProjectedGridUniforms) {
    sharedProjectedGridUniforms = buildSharedProjectedGridUniforms();
  }
  return sharedProjectedGridUniforms;
}

/**
 * Copies shared projected-grid uniform references into a material uniform map.
 *
 * @param target Destination uniform map for a ShaderMaterial.
 */
export function attachSharedProjectedGridUniforms(target: Record<string, THREE.IUniform>): void {
  const shared = getSharedProjectedGridUniforms();
  for (const uniformName of Object.keys(shared)) {
    const uniform = shared[uniformName];
    if (uniform) {
      target[uniformName] = uniform;
    }
  }
}

/**
 * Writes the oriented lattice plane into the shared uniforms.
 *
 * @param frame Grid plane origin and axes.
 */
export function writeSharedProjectedGridPlaneFrame(frame: EditorPlaneFrame): void {
  writeSharedVector3('gridOrigin', frame.origin);
  writeSharedVector3('gridUAxis', frame.uAxis);
  writeSharedVector3('gridVAxis', frame.vAxis);
  writeSharedVector3('gridNormal', frame.normal);
}

/**
 * Writes the minor cell size into the shared uniforms.
 *
 * @param cellSize World units per minor cell.
 */
export function writeSharedProjectedGridCellSize(cellSize: number): void {
  const uniform = getSharedProjectedGridUniforms()['cellSize'];
  if (!uniform) {
    return;
  }
  uniform.value = Math.max(cellSize, 0.001);
}

/**
 * Enables or disables lattice drawing for the current multi-view prepare pass.
 *
 * @param visible True when the projected grid should draw.
 */
export function writeSharedProjectedGridVisible(visible: boolean): void {
  sharedProjectedGridVisible = visible;
  const uniform = getSharedProjectedGridUniforms()['projectedGridEnabled'];
  if (!uniform) {
    return;
  }
  uniform.value = visible ? 1 : 0;
}

/**
 * Returns whether the shared projected grid is currently enabled for drawing.
 *
 * @returns True when enabled.
 */
export function readSharedProjectedGridVisible(): boolean {
  return sharedProjectedGridVisible;
}

/** Resets shared projected-grid state for tests and full editor dispose. */
export function resetSharedProjectedGridUniforms(): void {
  sharedProjectedGridUniforms = null;
  sharedProjectedGridVisible = true;
}

/**
 * Builds the initial shared uniform dictionary for the default floor frame.
 *
 * @returns Fresh uniform map with owned value objects.
 */
function buildSharedProjectedGridUniforms(): Record<string, THREE.IUniform> {
  const frame = buildDefaultPlaneFrame();
  return {
    gridOrigin: { value: frame.origin.clone() },
    gridUAxis: { value: frame.uAxis.clone() },
    gridVAxis: { value: frame.vAxis.clone() },
    gridNormal: { value: frame.normal.clone() },
    cellSize: { value: 0.25 },
    sectionEvery: { value: PROJECTED_GRID_SECTION_EVERY },
    majorEvery: { value: PROJECTED_GRID_MAJOR_EVERY },
    minorColor: { value: createDisplayReferredGridColor(Theme.gridColor) },
    sectionColor: { value: createDisplayReferredGridColor(Theme.gridOriginColor) },
    majorColor: { value: createDisplayReferredGridColor(0x888888) },
    minorAlpha: { value: 0.28 },
    sectionAlpha: { value: 0.42 },
    majorAlpha: { value: 0.55 },
    projectedGridEnabled: { value: 1 },
  };
}

/**
 * Builds a grid line color whose r/g/b channels match the hex display values
 * exactly. ColorManagement must not sRGB→linear convert these: they are mixed
 * into already-encoded framebuffer RGB (same as the old overlay pass).
 *
 * @param hex Display-referred sRGB hex (e.g. Theme.gridColor).
 * @returns Color holding raw display channel values.
 */
function createDisplayReferredGridColor(hex: number): THREE.Color {
  const red = ((hex >> 16) & 255) / 255;
  const green = ((hex >> 8) & 255) / 255;
  const blue = (hex & 255) / 255;
  return new THREE.Color().setRGB(red, green, blue, THREE.ColorManagement.workingColorSpace);
}

/**
 * Copies a world vector into a named shared vec3 uniform.
 *
 * @param uniformName Uniform key.
 * @param value Source vector.
 */
function writeSharedVector3(uniformName: string, value: THREE.Vector3): void {
  const uniform = getSharedProjectedGridUniforms()[uniformName];
  if (!uniform) {
    return;
  }
  const target = uniform.value as THREE.Vector3;
  target.copy(value);
}
