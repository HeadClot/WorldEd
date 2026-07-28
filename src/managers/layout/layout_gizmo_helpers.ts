import * as THREE from 'three';
import { SelectionManager } from '../../selection/object/selection_manager.js';
import { TransformGizmo } from '../../transform/gizmo/transform_gizmo.js';
import { TransformExecutor } from '../../transform/transform_executor.js';
import { TransformSpace } from '../../types/transform_space.js';
import type { Viewport3D } from '../../viewports/viewport_3d.js';
import type { Toolbar } from '../../ui/toolbar.js';

/** Dependencies for gizmo pivot and orientation updates. */
export interface LayoutGizmoContext {
  selectionManager: SelectionManager;
  transformGizmo: TransformGizmo;
  transformExecutor: TransformExecutor;
  transformSpace: TransformSpace;
  viewport3D: Viewport3D;
  toolbar: Toolbar;
  showStatusMessage: (message: string) => void;
}

/**
 * Updates the gizmo pivot to the selection center and refreshes orientation.
 *
 * @param context Gizmo subsystem dependencies.
 */
export function updateLayoutGizmoPivot(context: LayoutGizmoContext): void {
  const selected = Array.from(context.selectionManager.getSelectedObjects());
  if (selected.length > 0) {
    const pivot = context.transformExecutor.computePivot(selected);
    context.transformGizmo.setPivot(pivot);
    context.transformGizmo.setOrientation(resolveLayoutGizmoOrientation(context, selected));
    context.transformGizmo.updateScaleForCamera(context.viewport3D.getCamera());
    context.transformGizmo.updateBoundsFromMeshes(selected, context.viewport3D.getCamera());
    return;
  }
  context.transformGizmo.setPivot(new THREE.Vector3(0, 0, 0));
  context.transformGizmo.setOrientation(new THREE.Quaternion());
  context.transformGizmo.updateBoundsFromMeshes([]);
}

/**
 * Resolves handle orientation from transform space and selection.
 *
 * @param context Gizmo subsystem dependencies.
 * @param selected Currently selected meshes.
 * @returns World-space quaternion for the gizmo handles.
 */
export function resolveLayoutGizmoOrientation(
  context: Pick<LayoutGizmoContext, 'transformSpace'>,
  selected: THREE.Object3D[],
): THREE.Quaternion {
  if (context.transformSpace !== TransformSpace.Local || selected.length !== 1) {
    return new THREE.Quaternion();
  }
  const target = selected[0]!;
  target.updateMatrixWorld(true);
  const orientation = new THREE.Quaternion();
  target.getWorldQuaternion(orientation);
  return orientation;
}

/**
 * Applies a transform space mode, updates toolbar, and refreshes gizmos.
 *
 * @param context Gizmo subsystem dependencies.
 * @param space Global or Local.
 * @param setTransformSpace Stores the active transform space on the layout.
 */
export function applyLayoutTransformSpace(
  context: LayoutGizmoContext,
  space: TransformSpace,
  setTransformSpace: (space: TransformSpace) => void,
): void {
  setTransformSpace(space);
  const isLocal = space === TransformSpace.Local;
  context.toolbar.setButtonActiveByLabel('Global', !isLocal);
  context.toolbar.setButtonActiveByLabel('Local', isLocal);
  updateLayoutGizmoPivot({ ...context, transformSpace: space });
  context.showStatusMessage(isLocal ? 'Gizmo space: Local' : 'Gizmo space: Global');
}

/**
 * Keeps translate/rotate/scale gizmo handles a readable size relative to the 3D
 * camera. Bounds mode must not rebuild here: camera-distance handle sizes are
 * applied per multi-view pane via
 * {@link TransformGizmo.prepareBoundsCloneForCamera}. Calling
 * {@link TransformGizmo.updateBoundsFromMeshes} every frame deep-clones the
 * entire bounds hierarchy into every viewport group whenever distance changes,
 * which tanks large maps whenever the selection is near the camera.
 *
 * @param context Gizmo subsystem dependencies.
 */
export function updateLayoutGizmoCameraScale(context: LayoutGizmoContext): void {
  if (context.selectionManager.getSelectedObjectCount() === 0) return;
  context.transformGizmo.updateScaleForCamera(context.viewport3D.getCamera());
}
