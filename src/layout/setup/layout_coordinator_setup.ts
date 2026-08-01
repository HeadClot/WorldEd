import * as THREE from 'three';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { StatusBar } from '@/ui/status/status_bar.js';
import { CoordinatorCameraFit } from '@/navigation/camera/coordinator_camera_fit.js';
import { CoordinatorShadingMode } from '@/navigation/camera/coordinator_shading_mode.js';
import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';
import { ControllerSelectionVisual } from '@/selection/object/controller_selection_visual.js';
import { HandlerKeyboardShortcut } from '@/input/handler_keyboard_shortcut.js';
import { CoordinatorFaceMode } from '@/tools/face/coordinator_face_mode.js';
import { CommandStack } from '@/commands/command_stack.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { ControllerToolsPalette } from '@/tools/palette/controller/controller_tools_palette.js';
import { PolicyEditorOverlay } from '@/tools/overlay/policy_editor_overlay.js';
import { RegistryModalToolSession } from '@/tools/session/registry_modal_tool_session.js';
import {
  setupClipToolsAndPalette,
  cancelClipAndSelectObject,
} from '@/tools/clip_plane/layout/layout_clip_tools_setup.js';
import { ToolClipPlane } from '@/tools/clip_plane/tool_clip_plane.js';
import { HandlerClipPlane } from '@/tools/clip_plane/handler_clip_plane.js';
import { ToolsPalette } from '@/tools/palette/ui/tools_palette.js';
import { TransformMode } from '@/types/transform_mode.js';

/**
 * Builds camera fit and shading coordinators and wires their controls.
 *
 * @param parts Viewport and selection dependencies.
 * @returns Camera and shading coordinators.
 */
export function setupCameraAndShadingCoordinators(parts: {
  selectionManager: ManagerSelection;
  statusBar: StatusBar | null;
  keyboardShortcutHandler: HandlerKeyboardShortcut;
  getViewports: () => readonly ViewportEditor[];
  getViewportElements: () => readonly HTMLElement[];
  selectionVisualController: ControllerSelectionVisual;
  /** Live detached multi-monitor viewports for fit targeting. */
  getDetachedViewports?: () => readonly ViewportEditor[];
}): {
  cameraFitCoordinator: CoordinatorCameraFit;
  shadingModeCoordinator: CoordinatorShadingMode;
} {
  const shadingModeCoordinator = new CoordinatorShadingMode(
    parts.getViewports,
    parts.getViewportElements,
    parts.selectionVisualController,
    parts.statusBar,
  );
  const cameraFitCoordinator = new CoordinatorCameraFit(
    parts.selectionManager,
    parts.statusBar,
    () => shadingModeCoordinator.getOrderedViewports(),
    () => shadingModeCoordinator.getActiveViewportIndex(),
    () => parts.getDetachedViewports?.() ?? [],
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
  getViewports: () => ViewportEditor[];
  getPrimaryScene: () => THREE.Scene;
  commandStack: CommandStack;
  gridSnap: GridSnap;
  worldObject: THREE.Group;
  selectionManager: ManagerSelection;
  statusBar: StatusBar | null;
  keyboardShortcutHandler: HandlerKeyboardShortcut;
  showStatusMessage: (message: string) => void;
  syncPrimitivesToViewports: () => void;
  updateShadingMeshes: () => void;
  refreshOutliner: () => void;
  onSelectionModeUiChanged: () => void;
}): CoordinatorFaceMode {
  return new CoordinatorFaceMode({
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
  selectionManager: ManagerSelection;
  gridSnap: GridSnap;
  clipPlaneTool: ToolClipPlane;
  faceModeCoordinator: CoordinatorFaceMode;
  toolbarContainer: HTMLElement;
  getViewports: () => ViewportEditor[];
  keyboardShortcutHandler: HandlerKeyboardShortcut;
  showStatusMessage: (message: string) => void;
  syncPrimitivesToViewports: () => void;
  refreshOutliner: () => void;
  updateShadingMeshes: () => void;
  onToolStateChanged: () => void;
  onClipCancel: () => void;
  onTransformMode: (mode: TransformMode) => void;
  onOpenUvEditor: () => void;
  editorOverlayPolicy: PolicyEditorOverlay;
  modalToolSessionRegistry: RegistryModalToolSession;
  isEditorToolBusy?: () => boolean;
  switchToClipTool?: () => boolean;
  switchToObjectSelect?: () => void;
  registerClipTool?: (
    placement: import('@/tools/clip_plane/tool_clip_plane.js').ToolClipPlane,
    handler: HandlerClipPlane,
  ) => void;
}): {
  clipPlaneHandler: HandlerClipPlane;
  toolsPalette: ToolsPalette;
  toolsPaletteController: ControllerToolsPalette;
} {
  return setupClipToolsAndPalette({
    worldObject: parts.worldObject,
    commandStack: parts.commandStack,
    selectionManager: parts.selectionManager,
    gridSnap: parts.gridSnap,
    clipPlaneTool: parts.clipPlaneTool,
    faceExtrusionController: parts.faceModeCoordinator.getFaceExtrusionController(),
    toolbarContainer: parts.toolbarContainer,
    getViewports: parts.getViewports,
    keyboardShortcutHandler: parts.keyboardShortcutHandler,
    showStatusMessage: parts.showStatusMessage,
    syncPrimitivesToViewports: parts.syncPrimitivesToViewports,
    refreshOutliner: parts.refreshOutliner,
    updateShadingMeshes: parts.updateShadingMeshes,
    onToolStateChanged: parts.onToolStateChanged,
    onClipCancel: parts.onClipCancel,
    editorOverlayPolicy: parts.editorOverlayPolicy,
    modalToolSessionRegistry: parts.modalToolSessionRegistry,
    onTransformMode: parts.onTransformMode,
    onOpenUvEditor: parts.onOpenUvEditor,
    onExtrudeFaces: () => parts.faceModeCoordinator.onExtrudeFaces(),
    ...(parts.isEditorToolBusy !== undefined ? { isEditorToolBusy: parts.isEditorToolBusy } : {}),
    ...(parts.switchToClipTool !== undefined ? { switchToClipTool: parts.switchToClipTool } : {}),
    ...(parts.switchToObjectSelect !== undefined ? { switchToObjectSelect: parts.switchToObjectSelect } : {}),
    ...(parts.registerClipTool !== undefined ? { registerClipTool: parts.registerClipTool } : {}),
  });
}

/**
 * Cancels clip mode and selects the object tool in the palette.
 *
 * @param clipPlaneHandler Active clip handler.
 * @param toolsPaletteController Tools palette controller.
 */
export function cancelClipToolSelection(
  clipPlaneHandler: HandlerClipPlane | null,
  toolsPaletteController: ControllerToolsPalette | null,
): void {
  cancelClipAndSelectObject(clipPlaneHandler, toolsPaletteController);
}
