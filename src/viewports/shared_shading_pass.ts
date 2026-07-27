import * as THREE from 'three';
import { ShadingMode } from '../types/shading_mode.js';
import { ShadingModeManager } from './shading_mode_manager.js';

/** One shared shading manager for multi-view material passes. */
let passManager: ShadingModeManager | null = null;
/** Scene the pass manager is bound to. */
let passScene: THREE.Scene | null = null;
/** Last shading mode applied on the shared scene. */
let lastAppliedMode: ShadingMode | null = null;

/**
 * Applies a shading mode to the shared editor scene for one multi-view pane.
 * Skips work when the mode is already active so other panes do not thrash
 * materials every frame (which caused full-editor flicker).
 *
 * @param scene Shared editor scene.
 * @param mode Desired shading mode for this pane pass.
 * @param force When true, re-apply even if mode matches the last pass.
 */
export function applySharedShadingPass(scene: THREE.Scene, mode: ShadingMode, force: boolean = false): void {
  ensurePassManager(scene);
  if (!force && lastAppliedMode === mode) return;
  passManager!.snapshotMaterials();
  passManager!.setMode(mode);
  lastAppliedMode = mode;
}

/**
 * Forces the next shared shading pass to re-apply materials (e.g. after mesh
 * list or texture changes).
 */
export function invalidateSharedShadingPass(): void {
  lastAppliedMode = null;
}

/** Disposes the shared pass manager. Intended for tests and full editor dispose. */
export function disposeSharedShadingPass(): void {
  passManager?.dispose();
  passManager = null;
  passScene = null;
  lastAppliedMode = null;
}

/**
 * Ensures a shading manager exists for the given scene.
 *
 * @param scene Shared editor scene.
 */
function ensurePassManager(scene: THREE.Scene): void {
  if (passManager && passScene === scene) return;
  passManager?.dispose();
  passManager = new ShadingModeManager(scene);
  passScene = scene;
  lastAppliedMode = null;
}
