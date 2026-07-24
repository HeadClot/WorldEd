import * as THREE from 'three';
import type { SolidBrushInstance } from './solid_brush_instance.js';

/**
 * Compares Euler rotations component-wise.
 *
 * @param a First rotation.
 * @param b Second rotation.
 * @returns True when equal.
 */
export function eulerEquals(a: THREE.Euler, b: THREE.Euler): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z && a.order === b.order;
}

/**
 * Compares two brush id sequences for equality.
 *
 * @param before Previous ordered ids.
 * @param brushes Current brush list.
 * @returns True when order and membership match.
 */
export function sameBrushOrder(before: string[], brushes: readonly SolidBrushInstance[]): boolean {
  if (before.length !== brushes.length) return false;
  for (let index = 0; index < before.length; index++) {
    if (before[index] !== brushes[index].id) return false;
  }
  return true;
}

/**
 * Pulls mesh transform into the brush. Result UVs stick via brush-local bake
 * (uvStickToBrush), not offset rewrites.
 *
 * @param brush Brush instance.
 * @param textureLockEnabled Reserved; UV stick mode is controlled separately.
 */
export function pullBrushTransformWithOptionalTextureLock(
  brush: SolidBrushInstance,
  textureLockEnabled: boolean,
): void {
  void textureLockEnabled;
  brush.pullTransformFromMesh();
}

/**
 * Live-drag pull: mesh pose only (no per-frame face-offset churn).
 *
 * @param brush Brush instance.
 * @param textureLockEnabled Reserved; UV stick mode is controlled separately.
 */
export function pullLiveBrushTransform(brush: SolidBrushInstance, textureLockEnabled: boolean): void {
  void textureLockEnabled;
  brush.pullTransformFromMesh();
}

/**
 * Copies mesh transform into the brush when it differs from the stored one.
 *
 * @param brush Brush instance to sync.
 * @param textureLockEnabled Whether Tex Lock should stick face UVs.
 * @returns True when any transform or visibility component changed.
 */
export function pullTransformIfChanged(brush: SolidBrushInstance, textureLockEnabled: boolean = false): boolean {
  if (!brush.mesh) {
    brush.pullTransformFromMesh();
    return false;
  }
  const mesh = brush.mesh;
  const changed =
    !brush.position.equals(mesh.position) ||
    !eulerEquals(brush.rotation, mesh.rotation) ||
    !brush.scale.equals(mesh.scale) ||
    brush.visible !== mesh.visible;
  if (!changed) return false;
  pullBrushTransformWithOptionalTextureLock(brush, textureLockEnabled);
  return true;
}

/**
 * Pulls mesh transforms and returns ids of brushes that actually changed.
 *
 * @param brushes Brush instances to inspect.
 * @param textureLockEnabled Whether Tex Lock should stick face UVs.
 * @returns Brush ids whose transform or visibility changed.
 */
export function pullChangedBrushTransforms(
  brushes: readonly SolidBrushInstance[],
  textureLockEnabled: boolean = false,
): string[] {
  const changedIds: string[] = [];
  for (const brush of brushes) {
    if (pullTransformIfChanged(brush, textureLockEnabled)) {
      changedIds.push(brush.id);
    }
  }
  return changedIds;
}

/**
 * Pulls transforms from every brush mesh without dirty tracking.
 *
 * @param brushes Brush instances to sync.
 * @param textureLockEnabled Whether Tex Lock should stick face UVs.
 */
export function pullAllBrushTransforms(
  brushes: readonly SolidBrushInstance[],
  textureLockEnabled: boolean = false,
): void {
  for (const brush of brushes) {
    pullBrushTransformWithOptionalTextureLock(brush, textureLockEnabled);
  }
}

/**
 * Collects brush ids whose preview mesh pose no longer matches instance data.
 *
 * @param brushes Brush instances to inspect.
 * @returns Brush ids that drifted.
 */
export function collectDriftedBrushIds(brushes: readonly SolidBrushInstance[]): string[] {
  const driftedIds: string[] = [];
  for (const brush of brushes) {
    if (!brush.mesh) continue;
    if (brushPoseMatchesMesh(brush)) continue;
    driftedIds.push(brush.id);
  }
  return driftedIds;
}

/**
 * Returns whether stored brush transform matches its preview mesh pose.
 *
 * @param brush Brush with optional mesh.
 * @returns True when pose components match.
 */
function brushPoseMatchesMesh(brush: SolidBrushInstance): boolean {
  const mesh = brush.mesh;
  if (!mesh) return true;
  return (
    brush.position.equals(mesh.position) && eulerEquals(brush.rotation, mesh.rotation) && brush.scale.equals(mesh.scale)
  );
}
