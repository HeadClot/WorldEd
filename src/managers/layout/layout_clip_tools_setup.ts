import { ToolsPalette } from '../../ui/tools_palette.js';
import { ToolsPaletteController } from '../tools/tools_palette_controller.js';
import { resolveFloatingPanelAnchorElement } from '../../ui/floating_panel/floating_panel_viewport_anchor.js';
import { ClipPlaneTool } from '../clip_plane/clip_plane_tool.js';
import { ClipPlaneHandler } from '../clip_plane/clip_plane_handler.js';
import { FaceExtrusionController } from '../face/face_extrusion_controller.js';
import { SelectionManager } from '../../selection/object/selection_manager.js';
import { CommandStack } from '../../commands/command_stack.js';
import { GridSnap } from '../../transform/snap/grid_snap.js';
import { KeyboardShortcutHandler } from '../input/keyboard_shortcut_handler.js';
import { EditorToolId } from '../../types/editor_tool_id.js';
import { TransformMode } from '../../types/transform_mode.js';
import type { EditorViewport } from '../../viewports/editor_viewport.js';
import type { EditorOverlayPolicy } from '../tools/editor_overlay_policy.js';
import type { ModalToolSessionRegistry } from '../tools/modal_tool_session_registry.js';
import * as THREE from 'three';

/** Dependencies for tools palette and clip plane wiring. */
export interface ClipToolsSetupDeps {
  worldObject: THREE.Group;
  commandStack: CommandStack;
  selectionManager: SelectionManager;
  gridSnap: GridSnap;
  clipPlaneTool: ClipPlaneTool;
  faceExtrusionController: FaceExtrusionController;
  toolbarContainer: HTMLElement;
  getViewports: () => readonly EditorViewport[];
  keyboardShortcutHandler: KeyboardShortcutHandler;
  showStatusMessage: (message: string) => void;
  syncPrimitivesToViewports: () => void;
  refreshOutliner: () => void;
  updateShadingMeshes: () => void;
  onToolStateChanged: () => void;
  onClipCancel: () => void;
  onTransformMode: (mode: TransformMode) => void;
  onOpenUvEditor: () => void;
  onExtrudeFaces: () => void;
  editorOverlayPolicy: EditorOverlayPolicy;
  modalToolSessionRegistry: ModalToolSessionRegistry;
}

/** Result of tools palette and clip plane construction. */
export interface ClipToolsSetupResult {
  toolsPalette: ToolsPalette;
  toolsPaletteController: ToolsPaletteController;
  clipPlaneHandler: ClipPlaneHandler;
}

/**
 * Creates the floating Tools palette, clip plane handler, and related wiring.
 *
 * @param deps Shared services and viewports for clip/tools setup.
 * @returns Created palette, controller, and clip handler.
 */
export function setupClipToolsAndPalette(deps: ClipToolsSetupDeps): ClipToolsSetupResult {
  const clipPlaneHandler = createClipPlaneHandler(deps);
  const controllerHolder: { current: ToolsPaletteController | null } = {
    current: null,
  };
  const toolsPalette = createToolsPalette(deps, controllerHolder, clipPlaneHandler);
  const toolsPaletteController = createToolsPaletteController(deps, toolsPalette, clipPlaneHandler);
  controllerHolder.current = toolsPaletteController;
  wireClipPlaneViewportCallbacks(deps, clipPlaneHandler);
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
  getViewports: () => readonly EditorViewport[],
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
  viewports: readonly EditorViewport[],
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
  getViewports: () => readonly EditorViewport[],
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
function createClipPlaneHandler(deps: ClipToolsSetupDeps): ClipPlaneHandler {
  return new ClipPlaneHandler({
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
  controllerHolder: { current: ToolsPaletteController | null },
  clipPlaneHandler: ClipPlaneHandler,
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
  clipPlaneHandler: ClipPlaneHandler,
): ToolsPaletteController {
  return new ToolsPaletteController({
    toolsPalette,
    faceExtrusionController: deps.faceExtrusionController,
    clipPlaneTool: deps.clipPlaneTool,
    clipPlaneHandler,
    selectionManager: deps.selectionManager,
    editorOverlayPolicy: deps.editorOverlayPolicy,
    modalToolSessionRegistry: deps.modalToolSessionRegistry,
    showStatusMessage: deps.showStatusMessage,
  });
}

/**
 * Wires clip plane pointer callbacks on all viewports.
 *
 * @param deps Clip/tools setup dependencies.
 * @param clipPlaneHandler Clip plane handler receiving pointer events.
 */
function wireClipPlaneViewportCallbacks(deps: ClipToolsSetupDeps, clipPlaneHandler: ClipPlaneHandler): void {
  deps.getViewports().forEach((viewport) => {
    viewport.setClipPlaneCallback((event) => {
      return clipPlaneHandler.onPointerDown(event, viewport.getCamera(), viewport.getContentElement());
    });
  });
}

/**
 * Wires keyboard shortcuts used while the clip plane tool is active.
 *
 * @param deps Clip/tools setup dependencies.
 * @param clipPlaneHandler Clip plane handler for flip/commit actions.
 */
function wireClipPlaneKeyboardShortcuts(deps: ClipToolsSetupDeps, clipPlaneHandler: ClipPlaneHandler): void {
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
  clipPlaneHandler: ClipPlaneHandler | null,
  toolsPaletteController: ToolsPaletteController | null,
): void {
  clipPlaneHandler?.cancel();
  toolsPaletteController?.selectTool(EditorToolId.OBJECT);
}
