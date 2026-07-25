import * as THREE from 'three';
import { rebakeStoredFaceTextureMaps } from '../uv/planar_uv_projector.js';
import { isResultMesh, isSolidModelObject } from '../../solid/model/solid_model_keys.js';
import { SOLID_BRUSH_USERDATA_KEY } from '../../solid/model/solid_brush_visual.js';
import { shouldRebakeContentAfterTransform, type TextureLockFlags } from './texture_lock_transform.js';

/**
 * Dual texture locks for solid brushes and content meshes.
 *
 * Position lock — UVs stick when moving/rotating (off = world slide). Stretch
 * lock — UVs stretch when scaling (off = world tile/density).
 *
 * Toggling locks never rewrites UVs by itself; only subsequent transforms do.
 */
export class TextureLockSettings {
  private positionLocked: boolean;
  private stretchLocked: boolean;
  private changeCallbacks: Array<(flags: TextureLockFlags) => void>;

  /**
   * Creates texture lock settings. Defaults match the toolbar: position lock on
   * (UVs stick on move), stretch lock off (scale keeps world tile density).
   *
   * @param positionLocked Whether position lock starts enabled.
   * @param stretchLocked Whether stretch lock starts enabled.
   */
  constructor(positionLocked: boolean = true, stretchLocked: boolean = false) {
    this.positionLocked = positionLocked;
    this.stretchLocked = stretchLocked;
    this.changeCallbacks = [];
  }

  /**
   * Returns current lock flags.
   *
   * @returns Position and stretch lock state.
   */
  getFlags(): TextureLockFlags {
    return { positionLock: this.positionLocked, stretchLock: this.stretchLocked };
  }

  /**
   * Returns whether position lock is enabled.
   *
   * @returns True when UVs stick on move/rotate.
   */
  isPositionLocked(): boolean {
    return this.positionLocked;
  }

  /**
   * Returns whether stretch lock is enabled.
   *
   * @returns True when UVs stretch on scale.
   */
  isStretchLocked(): boolean {
    return this.stretchLocked;
  }

  /**
   * Legacy: true when either lock is on.
   *
   * @returns True when any lock is enabled.
   */
  isLocked(): boolean {
    return this.positionLocked || this.stretchLocked;
  }

  /**
   * Sets position lock without rewriting UVs.
   *
   * @param locked Desired state.
   */
  setPositionLocked(locked: boolean): void {
    if (this.positionLocked === locked) return;
    this.positionLocked = locked;
    this.notifyChanged();
  }

  /**
   * Sets stretch lock without rewriting UVs.
   *
   * @param locked Desired state.
   */
  setStretchLocked(locked: boolean): void {
    if (this.stretchLocked === locked) return;
    this.stretchLocked = locked;
    this.notifyChanged();
  }

  /**
   * Toggles position lock.
   *
   * @returns New state.
   */
  togglePositionLock(): boolean {
    this.setPositionLocked(!this.positionLocked);
    return this.positionLocked;
  }

  /**
   * Toggles stretch lock.
   *
   * @returns New state.
   */
  toggleStretchLock(): boolean {
    this.setStretchLocked(!this.stretchLocked);
    return this.stretchLocked;
  }

  /**
   * Legacy setter: sets both locks together.
   *
   * @param locked Desired state for both.
   */
  setLocked(locked: boolean): void {
    if (this.positionLocked === locked && this.stretchLocked === locked) return;
    this.positionLocked = locked;
    this.stretchLocked = locked;
    this.notifyChanged();
  }

  /**
   * Legacy toggle of both locks.
   *
   * @returns True when either lock is on after toggle.
   */
  toggle(): boolean {
    const next = !(this.positionLocked && this.stretchLocked);
    this.setLocked(next);
    return this.isLocked();
  }

  /**
   * Registers a lock-change listener.
   *
   * @param callback Invoked with new flags.
   */
  onChanged(callback: (flags: TextureLockFlags) => void): void {
    this.changeCallbacks.push(callback);
  }

  /**
   * After content-mesh transform: rebake world UVs only for unlocked
   * components. With both locks on, vertex UVs stick with the mesh (no
   * rebake).
   *
   * @param meshes Transformed meshes.
   * @param moved True when translation/rotation changed.
   * @param scaled True when scale changed.
   */
  applyContentTransformPolicy(meshes: THREE.Mesh[], moved: boolean, scaled: boolean): void {
    if (!shouldRebakeContentAfterTransform(this.getFlags(), moved, scaled)) return;
    meshes.forEach((mesh) => {
      if (!mesh.geometry) return;
      if (!isContentMeshEligibleForTextureLockRebake(mesh)) return;
      rebakeStoredFaceTextureMaps(mesh);
    });
  }

  /**
   * After undo/redo (or when the transform type is unknown): rebake content
   * meshes only in full world mode. When either lock is on, UV state is
   * restored by transform history snapshots and must not be overwritten.
   *
   * @param meshes Candidate meshes.
   */
  rebakeMeshesIfLocked(meshes: THREE.Mesh[]): void {
    const flags = this.getFlags();
    // Any lock means stick behavior was recorded in the undo command.
    if (flags.positionLock || flags.stretchLock) return;
    meshes.forEach((mesh) => {
      if (!mesh.geometry) return;
      if (!isContentMeshEligibleForTextureLockRebake(mesh)) return;
      rebakeStoredFaceTextureMaps(mesh);
    });
  }

  /**
   * No-op kept for call sites that used to sync maps on toggle. Toggles are
   * non-destructive; maps stay as authored until a transform.
   *
   * @param _root Unused scene root.
   */
  syncContentMappingsUnderRoot(_root: THREE.Object3D): void {
    void _root;
  }

  /** Notifies listeners. */
  private notifyChanged(): void {
    const flags = this.getFlags();
    this.changeCallbacks.forEach((callback) => callback(flags));
  }
}

/**
 * Returns whether a mesh may receive content UV lock rebake.
 *
 * @param mesh Candidate mesh.
 * @returns False for solid brushes/results.
 */
export function isContentMeshEligibleForTextureLockRebake(mesh: THREE.Mesh): boolean {
  if (isResultMesh(mesh)) return false;
  if (isSolidModelObject(mesh)) return false;
  if (mesh.userData[SOLID_BRUSH_USERDATA_KEY] === true) return false;
  return true;
}
