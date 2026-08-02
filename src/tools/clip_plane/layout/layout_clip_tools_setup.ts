import { ToolsPalette } from '@/tools/palette/ui/tools_palette.js';
import { ControllerToolsPalette } from '@/tools/palette/controller/controller_tools_palette.js';
import { resolveFloatingPanelAnchorElement } from '@/ui/floating_panel/panel_floating_viewport_anchor.js';
import { ToolClipPlane } from '@/tools/clip_plane/tool_clip_plane.js';
import { HandlerClipPlane } from '@/tools/clip_plane/handler_clip_plane.js';
import { ControllerFaceExtrusion } from '@/tools/face/controller_face_extrusion.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { CommandStack } from '@/commands/command_stack.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { HandlerKeyboardShortcut } from '@/input/handler_keyboard_shortcut.js';
import { EditorToolId } from '@/types/editor_tool_id.js';
import { TransformMode } from '@/types/transform_mode.js';
import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';
import type { PolicyEditorOverlay } from '@/tools/overlay/policy_editor_overlay.js';
import type { RegistryModalToolSession } from '@/tools/session/registry_modal_tool_session.js';
import * as THREE from 'three';

/** Dependencies for tools palette and clip plane wiring. */
export interface ClipToolsSetupDeps {
  worldObject: THREE.Group;
  commandStack: CommandStack;
  selectionManager: ManagerSelection;
  gridSnap: GridSnap;
  clipPlaneTool: ToolClipPlane;
  faceExtrusionController: ControllerFaceExtrusion;
  toolbarContainer: HTMLElement;
  getViewports: () => readonly ViewportEditor[];
  keyboardShortcutHandler: HandlerKeyboardShortcut;
  showStatusMessage: (message: string) => void;
  syncPrimitivesToViewports: () => void;
  refreshOutliner: () => void;
  updateShadingMeshes: () => void;
  onToolStateChanged: () => void;
  onClipCancel: () => void;
  onTransformMode: (mode: TransformMode) => void;
  onOpenUvEditor: () => void;
  onExtrudeFaces: () => void;
  editorOverlayPolicy: PolicyEditorOverlay;
  modalToolSessionRegistry: RegistryModalToolSession;
  /** When true, face/clip palette switches are refused (single-use exclusive). */
  isEditorToolBusy?: () => boolean;
  /**
   * Switches the editor window to the clip tool.
   *
   * @returns True when switched.
   */
  switchToClipTool?: () => boolean;
  /** Switches the editor window to object select. */
  switchToObjectSelect?: () => void;
  /** Switches the editor window to face select. */
  switchToFaceSelect?: () => void;
  /**
   * Registers the clip tool with the editor window.
   *
   * @param placement Clip placement model.
   * @param handler Clip handler.
   */
  registerClipTool?: (placement: ToolClipPlane, handler: HandlerClipPlane) => void;
}

/** Result of tools palette and clip plane construction. */
export interface ClipToolsSetupResult {
  toolsPalette: ToolsPalette;
  toolsPaletteController: ControllerToolsPalette;
  clipPlaneHandler: HandlerClipPlane;
}

/**
 * Creates the floating Tools palette, clip plane handler, and related wiring.
 *
 * @param deps Shared services and viewports for clip/tools setup.
 * @returns Created palette, controller, and clip handler.
 */
export function setupClipToolsAndPalette(deps: ClipToolsSetupDeps): ClipToolsSetupResult {
  const clipPlaneHandler = createClipPlaneHandler(deps);
  const controllerHolder: { current: ControllerToolsPalette | null } = {
    current: null,
  };
  const toolsPalette = createToolsPalette(deps, controllerHolder, clipPlaneHandler);
  const toolsPaletteController = createToolsPaletteController(deps, toolsPalette, clipPlaneHandler);
  controllerHolder.current = toolsPaletteController;
  wireClipPlaneKeyboardShortcuts(deps, clipPlaneHandler);
  bindFloatingPanelToViewports(toolsPalette, deps.getViewports);
  toolsPalette.show();
  scheduleStartupFloatingPanelLayoutPass(toolsPalette, deps.getViewports);
  return { toolsPalette, toolsPaletteController, clipPlaneHandler };
}

/** Floating panel surface needed to bind live viewport placement. */
export interface FloatingPanelViewportBindable {
  setDefaultAnchor: (anchor: HTMLElement | null) => void;
  setDefaultAnchorResolver: (resolver: (() => HTMLElement | null) | null) => void;
  repositionToDefaultAnchor: () => void;
}

/**
 * Binds a floating panel to live viewport placement rules (largest
 * perspective). The resolver runs on every open so removed startup panes do not
 * pin panels.
 *
 * @param panel Floating panel with anchor APIs.
 * @param getViewports Live editor viewports provider.
 */
export function bindFloatingPanelToViewports(
  panel: Pick<FloatingPanelViewportBindable, 'setDefaultAnchor' | 'setDefaultAnchorResolver'>,
  getViewports: () => readonly ViewportEditor[],
): void {
  const resolveAnchor = (): HTMLElement | null => resolveFloatingPanelAnchorElement(getViewports());
  panel.setDefaultAnchorResolver(resolveAnchor);
  panel.setDefaultAnchor(resolveAnchor());
}

/**
 * Sets a snapshot anchor on a floating panel from the current viewport list.
 * Prefer {@link bindFloatingPanelToViewports} so re-open rescans viewports.
 *
 * @param panel Floating panel with setDefaultAnchor.
 * @param viewports Live editor viewports.
 */
export function applyStartupFloatingPanelAnchor(
  panel: { setDefaultAnchor: (anchor: HTMLElement | null) => void },
  viewports: readonly ViewportEditor[],
): void {
  panel.setDefaultAnchor(resolveFloatingPanelAnchorElement(viewports));
}

/**
 * Re-resolves the anchor and repositions after pane geometry has been laid out.
 *
 * @param panel Visible floating panel.
 * @param getViewports Live editor viewports provider.
 */
export function scheduleStartupFloatingPanelLayoutPass(
  panel: FloatingPanelViewportBindable,
  getViewports: () => readonly ViewportEditor[],
): void {
  const apply = () => {
    bindFloatingPanelToViewports(panel, getViewports);
    panel.repositionToDefaultAnchor();
  };
  if (typeof requestAnimationFrame !== 'function') {
    apply();
    return;
  }
  requestAnimationFrame(apply);
}

/**
 * Builds the clip plane handler with scene mutation callbacks.
 *
 * @param deps Clip/tools setup dependencies.
 * @returns Configured clip plane handler.
 */
function createClipPlaneHandler(deps: ClipToolsSetupDeps): HandlerClipPlane {
  const handler = new HandlerClipPlane({
    worldObject: deps.worldObject,
    commandStack: deps.commandStack,
    selectionManager: deps.selectionManager,
    gridSnap: deps.gridSnap,
    clipPlaneTool: deps.clipPlaneTool,
    modalToolSessionRegistry: deps.modalToolSessionRegistry,
    showStatusMessage: deps.showStatusMessage,
    syncPrimitivesToViewports: deps.syncPrimitivesToViewports,
    refreshOutliner: deps.refreshOutliner,
    updateShadingMeshes: deps.updateShadingMeshes,
    onToolStateChanged: deps.onToolStateChanged,
  });
  deps.registerClipTool?.(deps.clipPlaneTool, handler);
  return handler;
}

/**
 * Builds the tools palette UI with deferred controller callbacks.
 *
 * @param deps Clip/tools setup dependencies.
 * @param controllerHolder Mutable holder filled after controller construction.
 * @param clipPlaneHandler Clip plane handler for commit/flip actions.
 * @returns Created tools palette.
 */
function createToolsPalette(
  deps: ClipToolsSetupDeps,
  controllerHolder: { current: ControllerToolsPalette | null },
  clipPlaneHandler: HandlerClipPlane,
): ToolsPalette {
  return new ToolsPalette(deps.toolbarContainer, {
    onSelectTool: (toolId) => controllerHolder.current?.selectTool(toolId),
    onTransformMode: (mode) => deps.onTransformMode(mode),
    onFlipClipPlane: () => clipPlaneHandler.flipPlane(),
    onCommitClip: () => clipPlaneHandler.commitClip(),
    onCommitSplit: () => clipPlaneHandler.commitSplit(),
    onOpenUvEditor: () => deps.onOpenUvEditor(),
    onExtrudeFaces: () => deps.onExtrudeFaces(),
  });
}

/**
 * Creates the tools palette controller for selection-mode tool switching.
 *
 * @param deps Clip/tools setup dependencies.
 * @param toolsPalette Tools palette panel.
 * @param clipPlaneHandler Clip plane handler.
 * @returns Configured tools palette controller.
 */
function createToolsPaletteController(
  deps: ClipToolsSetupDeps,
  toolsPalette: ToolsPalette,
  clipPlaneHandler: HandlerClipPlane,
): ControllerToolsPalette {
  return new ControllerToolsPalette({
    toolsPalette,
    faceExtrusionController: deps.faceExtrusionController,
    clipPlaneTool: deps.clipPlaneTool,
    clipPlaneHandler,
    selectionManager: deps.selectionManager,
    editorOverlayPolicy: deps.editorOverlayPolicy,
    modalToolSessionRegistry: deps.modalToolSessionRegistry,
    showStatusMessage: deps.showStatusMessage,
    ...(deps.isEditorToolBusy !== undefined ? { isEditorToolBusy: deps.isEditorToolBusy } : {}),
    ...(deps.switchToClipTool !== undefined ? { switchToClipTool: deps.switchToClipTool } : {}),
    ...(deps.switchToObjectSelect !== undefined ? { switchToObjectSelect: deps.switchToObjectSelect } : {}),
    ...(deps.switchToFaceSelect !== undefined ? { switchToFaceSelect: deps.switchToFaceSelect } : {}),
  });
}

/**
 * Wires keyboard shortcuts used while the clip plane tool is active.
 *
 * @param deps Clip/tools setup dependencies.
 * @param clipPlaneHandler Clip plane handler for flip/commit actions.
 */
function wireClipPlaneKeyboardShortcuts(deps: ClipToolsSetupDeps, clipPlaneHandler: HandlerClipPlane): void {
  deps.keyboardShortcutHandler.setClipPlaneShortcuts(
    () => deps.clipPlaneTool.isActive(),
    () => clipPlaneHandler.flipPlane(),
    () => clipPlaneHandler.commitClip(),
    () => clipPlaneHandler.commitSplit(),
    () => deps.onClipCancel(),
  );
}

/**
 * Cancels the clip tool and returns the palette to object select.
 *
 * @param clipPlaneHandler Active clip plane handler, if any.
 * @param toolsPaletteController Tools palette controller, if any.
 */
export function cancelClipAndSelectObject(
  clipPlaneHandler: HandlerClipPlane | null,
  toolsPaletteController: ControllerToolsPalette | null,
): void {
  clipPlaneHandler?.cancel();
  toolsPaletteController?.selectTool(EditorToolId.OBJECT);
}
