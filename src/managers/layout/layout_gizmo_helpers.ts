import * as THREE from 'three';
import { SelectionManager } from '../../selection/object/selection_manager.js';
import { TransformGizmo } from '../../transform/gizmo/transform_gizmo.js';
import { TransformExecutor } from '../../transform/transform_executor.js';
import { TransformSpace } from '../../types/transform_space.js';
import type { Toolbar } from '../../ui/toolbar.js';

/** Dependencies for gizmo pivot and orientation updates. */
export interface LayoutGizmoContext {
  selectionManager: SelectionManager;
  transformGizmo: TransformGizmo;
  transformExecutor: TransformExecutor;
  transformSpace: TransformSpace;
  /**
   * Optional camera for master-group scale and bounds sizing only. Per-pane
   * clone scale is applied in the render loop via
   * {@link TransformGizmo.prepareTransformCloneForCamera}.
   */
  getGizmoScaleCamera: () => THREE.Camera | null;
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
    applySelectionGizmoPose(context, selected);
    return;
  }
  context.transformGizmo.setPivot(new THREE.Vector3(0, 0, 0));
  context.transformGizmo.setOrientation(new THREE.Quaternion());
  context.transformGizmo.updateBoundsFromMeshes([]);
}

/**
 * Applies pivot, orientation, camera scale, and bounds size for a non-empty
 * selection.
 *
 * @param context Gizmo subsystem dependencies.
 * @param selected Currently selected meshes.
 */
function applySelectionGizmoPose(context: LayoutGizmoContext, selected: THREE.Mesh[]): void {
  const pivot = context.transformExecutor.computePivot(selected);
  context.transformGizmo.setPivot(pivot);
  context.transformGizmo.setOrientation(resolveLayoutGizmoOrientation(context, selected));
  syncGizmoOrthoDepthAxisPolicy(context);
  const camera = context.getGizmoScaleCamera();
  if (camera) {
    context.transformGizmo.updateScaleForCamera(camera);
    context.transformGizmo.updateBoundsFromMeshes(selected, camera);
    return;
  }
  context.transformGizmo.updateBoundsFromMeshes(selected);
}

/**
 * Hides Global-space depth axes in 2D panes; Local space keeps every axis.
 *
 * @param context Gizmo subsystem dependencies.
 */
function syncGizmoOrthoDepthAxisPolicy(context: LayoutGizmoContext): void {
  const hideDepthAxes = context.transformSpace !== TransformSpace.Local;
  context.transformGizmo.setHideOrthoDepthAxes(hideDepthAxes);
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
  const nextContext = { ...context, transformSpace: space };
  syncGizmoOrthoDepthAxisPolicy(nextContext);
  updateLayoutGizmoPivot(nextContext);
  context.showStatusMessage(isLocal ? 'Gizmo space: Local' : 'Gizmo space: Global');
}

/**
 * Intentionally does not stamp a shared scale onto every viewport clone.
 * Multi-view sizing is per pane in the render loop
 * ({@link TransformGizmo.prepareTransformCloneForCamera}); a global pass would
 * let the 3D fly camera inflate Top/Front/Side handles.
 *
 * @param _context Gizmo subsystem dependencies (unused).
 */
export function updateLayoutGizmoCameraScale(_context: LayoutGizmoContext): void {}
