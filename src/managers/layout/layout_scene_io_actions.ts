import type { CommandStack } from '../../commands/command_stack.js';
import type { GameProfile } from '../../settings/settings_types.js';
import type { SolidModelController } from '../solid/solid_model_controller.js';
import type { ClipPlaneHandler } from '../clip_plane/clip_plane_handler.js';
import type { FaceModeCoordinator } from '../face/face_mode_coordinator.js';
import type { SceneIOHandler } from '../tools/scene_io_handler.js';
import type { SelectionManager } from '../../selection/object/selection_manager.js';
import type { SnapSettingsController } from '../tools/snap_settings_controller.js';
import type { PropertiesPanel } from '../../ui/properties/properties_panel.js';
import type { StatusBar } from '../../ui/status_bar.js';
import { SolidModel } from '../../solid/model/solid_model.js';
import type * as THREE from 'three';

/** Dependencies for scene load / history refresh side effects. */
export interface LayoutSceneRefreshContext {
  selectionManager: SelectionManager;
  faceModeCoordinator: FaceModeCoordinator;
  commandStack: CommandStack;
  clipPlaneHandler: ClipPlaneHandler | null;
  snapSettingsController: SnapSettingsController;
  worldObject: THREE.Object3D;
  propertiesPanel: PropertiesPanel;
  refreshAfterWorldMutation: () => void;
  updateGizmoVisibility: () => void;
  updateGizmoPivot: () => void;
}

/**
 * Handles post-load synchronization and UI refresh after a scene file loads.
 *
 * @param context Scene refresh dependencies.
 */
export function handleLayoutSceneLoaded(context: LayoutSceneRefreshContext): void {
  context.selectionManager.clearSelection();
  context.faceModeCoordinator.getFaceExtrusionController().clearFaceSelection();
  context.commandStack.clear();
  context.clipPlaneHandler?.reattachPreviewToWorld();
  context.refreshAfterWorldMutation();
}

/**
 * Applies undo or redo and refreshes dependent editor UI state.
 *
 * @param context Scene refresh dependencies.
 * @param direction Whether to undo or redo the top command.
 */
export function applyLayoutHistoryChange(context: LayoutSceneRefreshContext, direction: 'undo' | 'redo'): void {
  if (direction === 'undo') context.commandStack.undo();
  else context.commandStack.redo();
  context.selectionManager.pruneSelectionNotInScene(context.worldObject);
  context.snapSettingsController.rebakeWorldTexturesIfLocked();
  SolidModel.refreshAfterHistoryChange(context.worldObject);
  // After solid remesh, drop face selections for deleted brushes/surfaces only.
  context.faceModeCoordinator.getFaceExtrusionController().pruneInvalidFaceSelection(context.worldObject);
  context.refreshAfterWorldMutation();
  context.propertiesPanel.refreshBoundObject();
  context.updateGizmoVisibility();
  context.updateGizmoPivot();
}

/**
 * Loads a VMF file, builds a solid model, and places it with undo support.
 *
 * @param sceneIOHandler Scene file dialog and import handler.
 * @param statusBar Status bar for progress and errors.
 * @param solidModelController Solid model placement controller.
 * @param refreshAfterWorldMutation Callback after the world graph changes.
 */
export async function runLayoutVmfImport(
  sceneIOHandler: SceneIOHandler,
  statusBar: StatusBar | null,
  solidModelController: SolidModelController | null,
  refreshAfterWorldMutation: () => void,
): Promise<void> {
  const result = await sceneIOHandler.importVmf(statusBar);
  if (!result) return;
  if (!solidModelController) {
    statusBar?.setErrorText('Solid model tools are not ready');
    return;
  }
  solidModelController.placeImportedModel(result.model, `Imported ${result.importedBrushCount} brushes from VMF`);
  refreshAfterWorldMutation();
}

/**
 * Exports the world as GLB using the active game profile when available.
 *
 * @param sceneIOHandler Scene I/O handler.
 * @param worldObject Root world group.
 * @param statusBar Status bar for progress.
 * @param profile Active game profile or null.
 */
export function runLayoutExportGlb(
  sceneIOHandler: SceneIOHandler,
  worldObject: THREE.Group,
  statusBar: StatusBar | null,
  profile: GameProfile | null,
): void {
  void sceneIOHandler.exportGlb(worldObject, statusBar, profile);
}
