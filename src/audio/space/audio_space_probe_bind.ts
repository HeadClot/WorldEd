import * as THREE from 'three';
import type { ManagerSelection } from '@/selection/object/manager_selection.js';
import { computeWorldBoundsFromObjects } from '@/audio/spatial/audio_bounds_closest_sound_pose.js';
import { audioSpaceProbe } from './audio_space_probe.js';

/** Provides live selection world bounds for volumetric snap placement. */
export type AudioSelectionBoundsProvider = () => THREE.Box3 | null;

let selectionBoundsProvider: AudioSelectionBoundsProvider | null = null;

/**
 * Binds the shared audio space probe to the live editor world and selection.
 *
 * @param worldObject Root world group containing solid geometry.
 * @param selectionManager Selection manager for probe origin and ignores.
 */
export function bindEditorAudioSpaceProbe(worldObject: THREE.Object3D, selectionManager: ManagerSelection): void {
  selectionBoundsProvider = () => computeWorldBoundsFromObjects(Array.from(selectionManager.getSelectedObjects()));
  audioSpaceProbe.bind({
    getProbeOrigin: () => computeSelectionProbeOrigin(selectionManager),
    getSolidMeshes: () => collectSolidMeshes(worldObject),
    getIgnoredObjects: () => Array.from(selectionManager.getSelectedObjects()),
  });
}

/**
 * Returns the current selection world AABB for volumetric sound placement.
 *
 * @returns Selection bounds, or null when unbound/empty.
 */
export function getAudioSelectionWorldBounds(): THREE.Box3 | null {
  if (!selectionBoundsProvider) {
    return null;
  }
  return selectionBoundsProvider();
}

/**
 * Computes a world-space probe origin from the current selection centers.
 *
 * @param selectionManager Selection manager.
 * @returns Average world position of selected objects, or origin when empty.
 */
function computeSelectionProbeOrigin(selectionManager: ManagerSelection): THREE.Vector3 {
  const selected = selectionManager.getSelectedObjects();
  if (selected.size === 0) {
    return new THREE.Vector3(0, 0, 0);
  }
  const sum = new THREE.Vector3();
  const worldPosition = new THREE.Vector3();
  selected.forEach((object) => {
    object.getWorldPosition(worldPosition);
    sum.add(worldPosition);
  });
  return sum.multiplyScalar(1 / selected.size);
}

/**
 * Collects visible solid meshes under the world root. Sphere culling during the
 * six probe rays keeps 2000+ brush scenes cheap; no hierarchy-order cap.
 *
 * @param worldObject World root.
 * @returns Mesh list for room ray probes.
 */
function collectSolidMeshes(worldObject: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  worldObject.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.visible || !child.geometry) {
      return;
    }
    meshes.push(child);
  });
  return meshes;
}
