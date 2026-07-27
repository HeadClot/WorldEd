import * as THREE from 'three';
import { SelectionManager } from '../../selection/object/selection_manager.js';
import { StatusBar } from '../../ui/status_bar.js';
import { CameraFitCoordinator } from '../camera/camera_fit_coordinator.js';
import { ShadingModeCoordinator } from '../camera/shading_mode_coordinator.js';
import type { EditorViewport } from '../../viewports/editor_viewport.js';
import { SelectionVisualController } from '../../selection/object/selection_visual_controller.js';
import { KeyboardShortcutHandler } from '../input/keyboard_shortcut_handler.js';
import { FaceModeCoordinator } from '../face/face_mode_coordinator.js';
import { CommandStack } from '../../commands/command_stack.js';
import { GridSnap } from '../../transform/snap/grid_snap.js';
import { ToolsPaletteController } from '../tools/tools_palette_controller.js';
import { setupClipToolsAndPalette, cancelClipAndSelectObject } from './layout_clip_tools_setup.js';
import { ClipPlaneTool } from '../clip_plane/clip_plane_tool.js';
import { ClipPlaneHandler } from '../clip_plane/clip_plane_handler.js';
import { ToolsPalette } from '../../ui/tools_palette.js';
import { TransformMode } from '../../types/transform_mode.js';

/**
 * Builds camera fit and shading coordinators and wires their controls.
 *
 * @param parts Viewport and selection dependencies.
 * @returns Camera and shading coordinators.
 */
export function setupCameraAndShadingCoordinators(parts: {
  selectionManager: SelectionManager;
  statusBar: StatusBar | null;
  keyboardShortcutHandler: KeyboardShortcutHandler;
  getViewports: () => readonly EditorViewport[];
  getViewportElements: () => readonly HTMLElement[];
  selectionVisualController: SelectionVisualController;
}): {
  cameraFitCoordinator: CameraFitCoordinator;
  shadingModeCoordinator: ShadingModeCoordinator;
} {
  const shadingModeCoordinator = new ShadingModeCoordinator(
    parts.getViewports,
    parts.getViewportElements,
    parts.selectionVisualController,
    parts.statusBar,
  );
  const cameraFitCoordinator = new CameraFitCoordinator(
    parts.selectionManager,
    parts.statusBar,
    () => shadingModeCoordinator.getOrderedViewports(),
    () => shadingModeCoordinator.getActiveViewportIndex(),
  );
  cameraFitCoordinator.bindKeyboardShortcuts(parts.keyboardShortcutHandler);
  shadingModeCoordinator.wireControls(parts.keyboardShortcutHandler, (viewport) =>
    cameraFitCoordinator.fitSpecificViewport(viewport),
  );
  return { cameraFitCoordinator, shadingModeCoordinator };
}

/**
 * Builds the face selection and extrusion coordinator.
 *
 * @param parts Scene and UI dependencies.
 * @returns Face mode coordinator.
 */
export function setupFaceModeCoordinator(parts: {
  getViewports: () => EditorViewport[];
  getPrimaryScene: () => THREE.Scene;
  commandStack: CommandStack;
  gridSnap: GridSnap;
  worldObject: THREE.Group;
  selectionManager: SelectionManager;
  statusBar: StatusBar | null;
  keyboardShortcutHandler: KeyboardShortcutHandler;
  showStatusMessage: (message: string) => void;
  syncPrimitivesToViewports: () => void;
  updateShadingMeshes: () => void;
  refreshOutliner: () => void;
  onSelectionModeUiChanged: () => void;
}): FaceModeCoordinator {
  return new FaceModeCoordinator({
    getViewports: parts.getViewports,
    getPrimaryScene: parts.getPrimaryScene,
    commandStack: parts.commandStack,
    gridSnap: parts.gridSnap,
    worldObject: parts.worldObject,
    selectionManager: parts.selectionManager,
    statusBar: parts.statusBar,
    keyboardShortcutHandler: parts.keyboardShortcutHandler,
    showStatusMessage: parts.showStatusMessage,
    syncPrimitivesToViewports: parts.syncPrimitivesToViewports,
    updateShadingMeshes: parts.updateShadingMeshes,
    refreshOutliner: parts.refreshOutliner,
    onSelectionModeUiChanged: () => parts.onSelectionModeUiChanged(),
  });
}

/**
 * Builds tools palette and clip plane tool wiring.
 *
 * @param parts Clip tool dependencies.
 * @returns Clip handler and tools palette pair.
 */
export function setupToolsPaletteAndClipWiring(parts: {
  worldObject: THREE.Group;
  commandStack: CommandStack;
  selectionManager: SelectionManager;
  gridSnap: GridSnap;
  clipPlaneTool: ClipPlaneTool;
  faceModeCoordinator: FaceModeCoordinator;
  toolbarContainer: HTMLElement;
  anchorViewport: HTMLElement;
  getViewports: () => EditorViewport[];
  keyboardShortcutHandler: KeyboardShortcutHandler;
  showStatusMessage: (message: string) => void;
  syncPrimitivesToViewports: () => void;
  refreshOutliner: () => void;
  updateShadingMeshes: () => void;
  onToolStateChanged: () => void;
  onClipCancel: () => void;
  onTransformMode: (mode: TransformMode) => void;
  onOpenUvEditor: () => void;
}): {
  clipPlaneHandler: ClipPlaneHandler;
  toolsPalette: ToolsPalette;
  toolsPaletteController: ToolsPaletteController;
} {
  return setupClipToolsAndPalette({
    worldObject: parts.worldObject,
    commandStack: parts.commandStack,
    selectionManager: parts.selectionManager,
    gridSnap: parts.gridSnap,
    clipPlaneTool: parts.clipPlaneTool,
    faceExtrusionController: parts.faceModeCoordinator.getFaceExtrusionController(),
    toolbarContainer: parts.toolbarContainer,
    anchorViewport: parts.anchorViewport,
    getViewports: parts.getViewports,
    keyboardShortcutHandler: parts.keyboardShortcutHandler,
    showStatusMessage: parts.showStatusMessage,
    syncPrimitivesToViewports: parts.syncPrimitivesToViewports,
    refreshOutliner: parts.refreshOutliner,
    updateShadingMeshes: parts.updateShadingMeshes,
    onToolStateChanged: parts.onToolStateChanged,
    onClipCancel: parts.onClipCancel,
    onTransformMode: parts.onTransformMode,
    onOpenUvEditor: parts.onOpenUvEditor,
    onExtrudeFaces: () => parts.faceModeCoordinator.onExtrudeFaces(),
  });
}

/**
 * Cancels clip mode and selects the object tool in the palette.
 *
 * @param clipPlaneHandler Active clip handler.
 * @param toolsPaletteController Tools palette controller.
 */
export function cancelClipToolSelection(
  clipPlaneHandler: ClipPlaneHandler | null,
  toolsPaletteController: ToolsPaletteController | null,
): void {
  cancelClipAndSelectObject(clipPlaneHandler, toolsPaletteController);
}
