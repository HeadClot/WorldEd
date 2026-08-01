import type * as THREE from 'three';

/** Callbacks that keep solid geometry, clones, and rulers in sync during a drag. */
export interface LayoutTransformLiveVisualsCallbacks {
  /**
   * Live solid CSG / brush geometry update for the current selection meshes.
   *
   * @param meshes Selected content meshes.
   */
  onTransformsLive?: (meshes: THREE.Mesh[]) => void;
  /**
   * Clone transforms, selection outlines, and related overlay sync.
   *
   * @param transformTargets Objects receiving pose edits.
   * @param selectedMeshes Current selection meshes.
   */
  onLiveTransformOverlaySync?: (
    transformTargets: readonly THREE.Object3D[],
    selectedMeshes: readonly THREE.Mesh[],
  ) => void;
  /**
   * CAD ruler live feedback during transform.
   *
   * @param meshes Selected meshes.
   * @param phase Feedback phase.
   */
  onRulerTransformFeedback?: (meshes: THREE.Mesh[], phase: 'begin' | 'move' | 'end') => void;
}

/** Selection snapshot used for live transform visuals. */
export interface LayoutTransformLiveVisualsSelection {
  selectedMeshes: THREE.Mesh[];
  transformTargets: THREE.Object3D[];
}

/**
 * Publishes live solid CSG, clone/outline sync, and ruler feedback after a pose
 * sample (pointer move or modal keyboard axis/numeric edit).
 *
 * @param callbacks Layout live visual sinks.
 * @param selection Current unlocked selection snapshot.
 */
export function publishLayoutTransformLiveVisuals(
  callbacks: LayoutTransformLiveVisualsCallbacks,
  selection: LayoutTransformLiveVisualsSelection,
): void {
  callbacks.onTransformsLive?.(selection.selectedMeshes);
  callbacks.onLiveTransformOverlaySync?.(selection.transformTargets, selection.selectedMeshes);
  callbacks.onRulerTransformFeedback?.(selection.selectedMeshes, 'move');
}

/**
 * After a modal transform key is handled, returns whether live visuals should
 * republish (pose may have changed while the drag is still active).
 *
 * @param handled True when the modal controller consumed the key.
 * @param isDragging True when a transform drag is still active after the key.
 * @returns True when live solid/overlay refresh should run.
 */
export function shouldPublishLiveVisualsAfterModalKey(handled: boolean, isDragging: boolean): boolean {
  return handled && isDragging;
}
