import * as THREE from 'three';
import { TransformMode } from '@/types/transform_mode.js';
import { HandlerTransform } from '@/transform/core/handler_transform.js';
import { GizmoTransform } from '@/transform/gizmo/gizmo_transform.js';
import { ManagerInput } from '@/input/manager_input.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { filterUnlockedObjects } from '@/utils/object_lock.js';
import { resolveTransformTargets } from '@/selection/object/resolve_transform_targets.js';
import { EditorWindow } from '@/editor/window/editor_window.js';
import { EditorInputBridge } from '@/editor/window/editor_input_bridge.js';
import type { EditorServices } from '@/editor/window/editor_services.js';
import { GuiWindow } from '@/editor/gui/gui_window.js';
import type { ISelectable } from '@/editor/i_selectable.js';
import { ClipTool } from '@/editor/tools/clip_tool.js';
import type { ToolClipPlane } from '@/tools/clip_plane/tool_clip_plane.js';
import type { HandlerClipPlane } from '@/tools/clip_plane/handler_clip_plane.js';
import type { Viewport3D } from '@/viewports/core/viewport_3d.js';
import type { Viewport2D } from '@/viewports/core/viewport_2d.js';
import { keyboardShortcutCodeFromEvent } from '@/input/keyboard_event_match.js';
import {
  publishLayoutTransformLiveVisuals,
  shouldPublishLiveVisualsAfterModalKey,
} from './layout_transform_live_visuals.js';

/** Dependencies for building the Shape Editor-style tool stack. */
export interface LayoutToolEditorSetupDeps {
  transformHandler: HandlerTransform;
  transformGizmo: GizmoTransform;
  selectionManager: ManagerSelection;
  inputManager: ManagerInput;
  getActiveViewport: () => Viewport3D | Viewport2D | null;
  /**
   * All interactive panes (2D + 3D, including detached). Used so tools can
   * resolve camera/pick from the pane under the pointer.
   */
  getInteractiveViewports: () => ReadonlyArray<Viewport3D | Viewport2D>;
  getTransformPivot: () => THREE.Vector3;
  setStatusMessage: (message: string) => void;
  refreshGizmoPresentation: () => void;
  onAfterTransformCommit: (objects: THREE.Object3D[]) => void;
  onTransformsLive?: (meshes: THREE.Mesh[]) => void;
  onRulerTransformFeedback?: (meshes: THREE.Mesh[], phase: 'begin' | 'move' | 'end') => void;
  /**
   * Keeps 2D clones, selection outlines, and gizmo glued during live single-use
   * moves (same contract as gizmo pointer-move).
   *
   * @param transformTargets Objects receiving pose edits.
   * @param selectedMeshes Current selection meshes (solid live CSG keys off
   *   these).
   */
  onLiveTransformOverlaySync?: (
    transformTargets: readonly THREE.Object3D[],
    selectedMeshes: readonly THREE.Mesh[],
  ) => void;
  /**
   * Editor-global shortcut fallthrough (undo, file, tool SwitchTool map).
   *
   * @param event Browser keyboard event.
   * @returns True when handled.
   */
  handleGlobalKeyDown?: (event: KeyboardEvent) => boolean;
  /**
   * Returns whether camera navigation must suppress tool activation keys.
   *
   * @returns True while fly/pan owns continuous motion keys.
   */
  isNavigationBlockingTools?: () => boolean;
  /**
   * Returns the last pointer client position for a detached (or other)
   * document. Main-document samples use {@link inputManager} instead.
   *
   * @param ownerDocument Document that owns the pointer sample.
   * @returns Client coordinates, or null when unknown.
   */
  getLastPointerClientPositionForDocument?: (ownerDocument: Document) => { clientX: number; clientY: number } | null;
}

/** Built tool system exposed to the layout for keyboard and mode switches. */
export interface LayoutToolEditorSystem {
  editorWindow: EditorWindow;
  inputBridge: EditorInputBridge;
  /**
   * Toolbar / permanent mode switch (Shape Editor SwitchTool).
   *
   * @param mode Transform mode.
   * @returns True when the permanent tool is active.
   */
  switchToTransformMode: (mode: TransformMode) => boolean;
  /**
   * Returns to the default object-select tool.
   *
   * @returns True when object-select is active.
   */
  switchToObjectSelect: () => boolean;
  /**
   * Cancels an active single-use tool if one is running.
   *
   * @returns True when a single-use tool was cancelled.
   */
  cancelActiveSingleUseTool: () => boolean;
  /**
   * Returns whether the active tool is busy (exclusive input).
   *
   * @returns True while a tool must keep focus.
   */
  isToolBusy: () => boolean;
  /**
   * Returns whether the focused event receiver is busy (Shape Editor
   * exclusive).
   *
   * @returns True while focus cannot leave the current receiver.
   */
  isActiveEventReceiverBusy: () => boolean;
  /**
   * Registers a floating tool window with the focus system.
   *
   * @param rootElement Panel root element.
   * @param surfaceId Stable surface id.
   */
  registerGuiSurface: (rootElement: HTMLElement, surfaceId: string) => void;
  /**
   * Unregisters a floating tool window from the focus system.
   *
   * @param rootElement Panel root element.
   */
  unregisterGuiSurface: (rootElement: HTMLElement) => void;
  /**
   * Installs capture-phase focus pointer routing on the editor host.
   *
   * @param hostElement Element that contains floating panels.
   */
  installFocusPointerRouter: (hostElement: HTMLElement) => void;
  /** Removes the capture-phase focus pointer router. */
  uninstallFocusPointerRouter: () => void;
  /**
   * Shape Editor OnKeyDown entry for the keyboard shortcut handler.
   *
   * @param event Browser keyboard event.
   * @returns True when consumed.
   */
  handleKeyDown: (event: KeyboardEvent) => boolean;
  /**
   * Sets the global keydown fallthrough (after tools).
   *
   * @param handler Global shortcut handler.
   */
  setGlobalKeyDownHandler: (handler: (event: KeyboardEvent) => boolean) => void;
  /**
   * Sets whether camera navigation suppresses tool keys.
   *
   * @param callback Returns true while navigation blocks tools.
   */
  setNavigationBlocksActions: (callback: () => boolean) => void;
  /**
   * Registers the clip plane tool with the editor window after the handler
   * exists.
   *
   * @param placement Clip placement model.
   * @param handler Clip interaction handler.
   * @returns Registered clip tool.
   */
  registerClipTool: (placement: ToolClipPlane, handler: HandlerClipPlane) => ClipTool;
  /**
   * Switches to the clip plane tool.
   *
   * @returns True when the clip tool is active.
   */
  switchToClipTool: () => boolean;
  /**
   * Returns whether the clip tool is the active editor tool.
   *
   * @returns True while clipping.
   */
  isClipToolActive: () => boolean;
}

/**
 * Builds the Shape Editor window, input bridge, and permanent tools.
 *
 * @param deps Layout services.
 * @returns Tool system handles.
 */
export function createLayoutToolEditorSystem(deps: LayoutToolEditorSetupDeps): LayoutToolEditorSystem {
  const editorWindow = new EditorWindow();
  const inputBridge = new EditorInputBridge(editorWindow);
  let globalKeyDown: ((event: KeyboardEvent) => boolean) | null = deps.handleGlobalKeyDown ?? null;
  let navigationBlocks: (() => boolean) | null = deps.isNavigationBlockingTools ?? null;
  const services = createEditorServices(
    deps,
    () => globalKeyDown,
    () => navigationBlocks,
    inputBridge,
  );
  editorWindow.setServices(services);
  editorWindow.validateTools();
  wireAfterDragVisualRefresh(deps);
  return {
    editorWindow,
    inputBridge,
    switchToTransformMode: (mode) => switchPermanentTransformMode(editorWindow, mode),
    switchToObjectSelect: () => {
      editorWindow.userSwitchToBoxSelectTool();
      return true;
    },
    cancelActiveSingleUseTool: () => cancelActiveSingleUseTool(editorWindow),
    isToolBusy: () => editorWindow.isToolBusy,
    isActiveEventReceiverBusy: () => editorWindow.isActiveEventReceiverBusy,
    registerGuiSurface: (rootElement, surfaceId) => {
      editorWindow.registerGuiWindow(new GuiWindow(rootElement, surfaceId));
    },
    unregisterGuiSurface: (rootElement) => {
      editorWindow.unregisterGuiWindowByRoot(rootElement);
    },
    installFocusPointerRouter: (hostElement) => {
      inputBridge.install(hostElement);
    },
    uninstallFocusPointerRouter: () => {
      inputBridge.uninstall();
    },
    handleKeyDown: (event) => {
      const keyCode = keyboardShortcutCodeFromEvent(event);
      return editorWindow.onKeyDown(keyCode, event);
    },
    setGlobalKeyDownHandler: (handler) => {
      globalKeyDown = handler;
    },
    setNavigationBlocksActions: (callback) => {
      navigationBlocks = callback;
    },
    registerClipTool: (placement, handler) => {
      const clipTool = new ClipTool(placement, handler);
      editorWindow.setClipTool(clipTool);
      return clipTool;
    },
    switchToClipTool: () => editorWindow.userSwitchToClipTool(),
    isClipToolActive: () => editorWindow.isClipToolActive(),
  };
}

/**
 * Switches to a permanent transform tool (toolbar SwitchTool).
 *
 * @param editorWindow Editor window.
 * @param mode Transform mode.
 * @returns True when switched.
 */
function switchPermanentTransformMode(editorWindow: EditorWindow, mode: TransformMode): boolean {
  if (mode === TransformMode.TRANSLATE) {
    editorWindow.userSwitchToTranslateTool();
    return true;
  }
  if (mode === TransformMode.ROTATE) {
    editorWindow.userSwitchToRotateTool();
    return true;
  }
  if (mode === TransformMode.SCALE) {
    editorWindow.userSwitchToScaleTool();
    return true;
  }
  editorWindow.userSwitchToBoxSelectTool();
  return true;
}

/**
 * Cancels the active single-use tool when one is running (Shape Editor Escape).
 *
 * @param editorWindow Editor window.
 * @returns True when a single-use tool was cancelled.
 */
function cancelActiveSingleUseTool(editorWindow: EditorWindow): boolean {
  const active = editorWindow.activeTool;
  if (!active || !active.isSingleUse) {
    return false;
  }
  active.onKeyDown('Escape');
  return true;
}

/**
 * Builds map-editor services for EditorWindow tools and widgets.
 *
 * @param deps Layout services.
 * @param getGlobalKeyDown Global keydown fallthrough getter.
 * @param getNavigationBlocks Navigation block getter.
 * @param inputBridge Input bridge for exclusive viewport root.
 * @returns Services implementation.
 */
function createEditorServices(
  deps: LayoutToolEditorSetupDeps,
  getGlobalKeyDown: () => ((event: KeyboardEvent) => boolean) | null,
  getNavigationBlocks: () => (() => boolean) | null,
  inputBridge: EditorInputBridge,
): EditorServices {
  const selectableCache = new Map<THREE.Object3D, ISelectable>();
  return {
    getTransformTargets: () => {
      const selected = filterUnlockedObjects(deps.selectionManager.getAllSelectedObjectsAsArray());
      return resolveTransformTargets(selected, deps.selectionManager.getInspectorObjects());
    },
    forEachSelectedObject: () =>
      iterateSelectables(filterUnlockedObjects(deps.selectionManager.getAllSelectedObjectsAsArray()), selectableCache),
    getSelectedCount: () => filterUnlockedObjects(deps.selectionManager.getAllSelectedObjectsAsArray()).length,
    getTransformPivot: () => deps.getTransformPivot(),
    getSelectedSegmentsAveragePosition: () => resolveAverageScreenPosition(deps),
    isSnapping: () => false,
    getGridSnap: () => 1,
    getAngleSnap: () => 15,
    screenPointToGrid: (screenX, screenY) => ({ x: screenX, y: screenY }),
    gridPointToScreen: (gridX, gridY) => ({ x: gridX, y: gridY }),
    getActiveCamera: () => deps.getActiveViewport()?.getCamera() ?? null,
    getActivePickElement: () => deps.getActiveViewport()?.getContentElement() ?? null,
    resolveInteractiveViewportAtClientPoint: (clientX, clientY, ownerDocument) =>
      resolveInteractiveViewportAtClientPoint(deps, clientX, clientY, ownerDocument),
    resolveFirstInteractiveViewportInDocument: (ownerDocument) =>
      resolveFirstInteractiveViewportInDocument(deps, ownerDocument),
    getInteractiveViewportPickElements: () => collectInteractivePickElements(deps),
    beginSingleUseDrag: (mode, objects, pivot, camera, pickElement, clientX, clientY) => {
      return beginSingleUseDragHiddenGizmo(
        deps,
        inputBridge,
        mode,
        objects,
        pivot,
        camera,
        pickElement,
        clientX,
        clientY,
      );
    },
    applySingleUsePointerMove: (clientX, clientY, camera, pickElement) => {
      applySingleUsePointerMove(deps, clientX, clientY, camera, pickElement);
    },
    isTransformDragActive: () => deps.transformHandler.isDragging(),
    isPermanentGizmoHandleDragActive: () =>
      deps.transformHandler.isDragging() && !deps.transformHandler.isSingleUseDrag(),
    handleModalKeyDown: (_keyCode, event) => handleModalKeyDownWithLiveVisuals(deps, event),
    commitActiveTransformDrag: () => {
      deps.transformHandler.commitActiveDragIfNeeded();
      inputBridge.setExclusiveViewportRoots(null);
      deps.refreshGizmoPresentation();
    },
    cancelActiveTransformDrag: () => {
      deps.transformHandler.cancelActiveDragIfNeeded();
      inputBridge.setExclusiveViewportRoots(null);
      deps.refreshGizmoPresentation();
    },
    pinExclusiveViewportDomain: (pickElements) => {
      inputBridge.setExclusiveViewportRoots(pickElements);
    },
    pinExclusiveViewport: (pickElement) => {
      if (pickElement === undefined || pickElement === null) {
        inputBridge.setExclusiveViewportRoots(collectInteractivePickElements(deps));
        return;
      }
      inputBridge.setExclusiveViewportRoot(pickElement);
    },
    clearExclusiveViewport: () => {
      inputBridge.setExclusiveViewportRoots(null);
    },
    setWidgetMode: (mode) => {
      deps.transformGizmo.setMode(mode);
    },
    refreshGizmoPresentation: () => deps.refreshGizmoPresentation(),
    setStatusMessage: (message) => deps.setStatusMessage(message),
    registerUndo: (_name) => {},
    discardUndo: () => {},
    publishTransformDragVisualEnd: (objects, _reason) => {
      deps.onAfterTransformCommit([...objects]);
    },
    getLastPointerClientPosition: (ownerDocument) => resolveLastPointerClientPosition(deps, ownerDocument),
    isShiftPressed: () => deps.inputManager.isKeyDown('ShiftLeft') || deps.inputManager.isKeyDown('ShiftRight'),
    isCtrlPressed: () =>
      deps.inputManager.isKeyDown('ControlLeft') ||
      deps.inputManager.isKeyDown('ControlRight') ||
      deps.inputManager.isKeyDown('MetaLeft') ||
      deps.inputManager.isKeyDown('MetaRight'),
    isModifierPressed: () => {
      return (
        deps.inputManager.isKeyDown('ShiftLeft') ||
        deps.inputManager.isKeyDown('ShiftRight') ||
        deps.inputManager.isKeyDown('ControlLeft') ||
        deps.inputManager.isKeyDown('ControlRight') ||
        deps.inputManager.isKeyDown('AltLeft') ||
        deps.inputManager.isKeyDown('AltRight') ||
        deps.inputManager.isKeyDown('MetaLeft') ||
        deps.inputManager.isKeyDown('MetaRight')
      );
    },
    handleGlobalKeyDown: (_keyCode, event) => getGlobalKeyDown()?.(event) === true,
    isNavigationBlockingTools: () => getNavigationBlocks()?.() === true,
  };
}

/**
 * Yields selectable wrappers for selected objects.
 *
 * @param objects Selected objects.
 * @param cache Selectable cache by object identity.
 * @returns Iterable of selectables.
 */
function* iterateSelectables(
  objects: THREE.Object3D[],
  cache: Map<THREE.Object3D, ISelectable>,
): Iterable<ISelectable> {
  for (const object of objects) {
    let selectable = cache.get(object);
    if (!selectable) {
      selectable = createSelectableForObject(object);
      cache.set(object, selectable);
    }
    selectable.selected = true;
    selectable.position.copy(object.position);
    yield selectable;
  }
}

/**
 * Creates an ISelectable wrapper for a Three.js object.
 *
 * @param object Scene object.
 * @returns Selectable wrapper.
 */
function createSelectableForObject(object: THREE.Object3D): ISelectable {
  return {
    selected: true,
    position: object.position.clone(),
    gpVector1: new THREE.Vector3(),
  };
}

/**
 * Resolves average screen position of the selection for widget placement.
 *
 * @param deps Layout services.
 * @returns Screen coordinates.
 */
function resolveAverageScreenPosition(deps: LayoutToolEditorSetupDeps): { x: number; y: number } {
  const viewport = deps.getActiveViewport();
  const pickElement = viewport?.getContentElement();
  if (!pickElement) {
    return { x: 0, y: 0 };
  }
  const rect = pickElement.getBoundingClientRect();
  return {
    x: rect.left + rect.width * 0.5,
    y: rect.top + rect.height * 0.5,
  };
}

/**
 * Collects content elements for every interactive pane.
 *
 * @param deps Layout services.
 * @returns Pick elements in layout order.
 */
function collectInteractivePickElements(deps: LayoutToolEditorSetupDeps): HTMLElement[] {
  const elements: HTMLElement[] = [];
  for (const viewport of deps.getInteractiveViewports()) {
    const content = viewport.getContentElement();
    if (content) {
      elements.push(content);
    }
  }
  return elements;
}

/**
 * Resolves camera and pick element for the interactive pane under a client
 * point. Client coordinates are document-local; when ownerDocument is set only
 * panes in that document are tested.
 *
 * @param deps Layout services.
 * @param clientX Pointer client X.
 * @param clientY Pointer client Y.
 * @param ownerDocument Optional document that owns the client coordinates.
 * @returns Pick context, or null when the point is not over a pane.
 */
function resolveInteractiveViewportAtClientPoint(
  deps: LayoutToolEditorSetupDeps,
  clientX: number,
  clientY: number,
  ownerDocument?: Document | null,
): { camera: THREE.Camera; pickElement: HTMLElement } | null {
  for (const viewport of deps.getInteractiveViewports()) {
    const pickElement = viewport.getContentElement();
    if (!pickElement) {
      continue;
    }
    if (ownerDocument && pickElement.ownerDocument !== ownerDocument) {
      continue;
    }
    const rect = pickElement.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      continue;
    }
    return {
      camera: viewport.getCamera(),
      pickElement,
    };
  }
  return null;
}

/**
 * Returns the first interactive pane in a document (or any pane when document
 * is omitted).
 *
 * @param deps Layout services.
 * @param ownerDocument Document filter, or null for the first interactive pane.
 * @returns Pick context, or null when no pane exists.
 */
function resolveFirstInteractiveViewportInDocument(
  deps: LayoutToolEditorSetupDeps,
  ownerDocument?: Document | null,
): { camera: THREE.Camera; pickElement: HTMLElement } | null {
  for (const viewport of deps.getInteractiveViewports()) {
    const pickElement = viewport.getContentElement();
    if (!pickElement) {
      continue;
    }
    if (ownerDocument && pickElement.ownerDocument !== ownerDocument) {
      continue;
    }
    return {
      camera: viewport.getCamera(),
      pickElement,
    };
  }
  return null;
}

/**
 * Resolves the last pointer client position for a document.
 *
 * @param deps Layout services.
 * @param ownerDocument Document that owns the sample, or null for main.
 * @returns Client coordinates, or null.
 */
function resolveLastPointerClientPosition(
  deps: LayoutToolEditorSetupDeps,
  ownerDocument?: Document | null,
): { clientX: number; clientY: number } | null {
  if (!ownerDocument || ownerDocument === document) {
    return deps.inputManager.getLastPointerClientPosition();
  }
  return deps.getLastPointerClientPositionForDocument?.(ownerDocument) ?? null;
}

/**
 * Starts a single-use drag with gizmos hidden (Shape Editor / Blender: no
 * transform widgets during G/R/S).
 *
 * @param deps Layout services.
 * @param inputBridge Input bridge for exclusive viewport pin.
 * @param mode Transform mode.
 * @param objects Drag targets.
 * @param pivot World pivot.
 * @param camera Active camera.
 * @param pickElement Pick element.
 * @param clientX Pointer client X.
 * @param clientY Pointer client Y.
 * @returns True when the drag started.
 */
function beginSingleUseDragHiddenGizmo(
  deps: LayoutToolEditorSetupDeps,
  inputBridge: EditorInputBridge,
  mode: TransformMode,
  objects: THREE.Object3D[],
  pivot: THREE.Vector3,
  camera: THREE.Camera,
  pickElement: HTMLElement,
  clientX: number,
  clientY: number,
): boolean {
  inputBridge.setExclusiveViewportRoots(collectInteractivePickElements(deps));
  const started = deps.transformHandler.beginSingleUseDrag(mode, objects, pivot, camera, pickElement, clientX, clientY);
  if (started) {
    deps.transformGizmo.setVisible(false);
  }
  return started;
}

/**
 * Applies a live single-use pointer move sample.
 *
 * @param deps Layout services.
 * @param clientX Pointer client X.
 * @param clientY Pointer client Y.
 * @param camera Camera for projection.
 * @param pickElement Pick element for NDC.
 */
function applySingleUsePointerMove(
  deps: LayoutToolEditorSetupDeps,
  clientX: number,
  clientY: number,
  camera: THREE.Camera,
  pickElement: HTMLElement,
): void {
  if (!deps.transformHandler.isDragging()) {
    return;
  }
  const selection = resolveSingleUseSelection(deps);
  const pivot = deps.getTransformPivot();
  const synthetic = {
    clientX,
    clientY,
    preventDefault: () => {},
    stopPropagation: () => {},
  } as unknown as MouseEvent;
  deps.transformHandler.onPointerMove(camera, pickElement, synthetic, pivot, selection.transformTargets);
  publishLiveTransformVisuals(deps, selection);
}

/**
 * Routes modal transform keys (axis lock, numeric typing) and refreshes solid
 * geometry / overlays with the same live path as pointer moves.
 *
 * @param deps Layout services.
 * @param event Browser keyboard event.
 * @returns True when the modal controller consumed the key.
 */
function handleModalKeyDownWithLiveVisuals(deps: LayoutToolEditorSetupDeps, event: KeyboardEvent): boolean {
  const handled = deps.transformHandler.handleModalKeyDown(event);
  if (!shouldPublishLiveVisualsAfterModalKey(handled, deps.transformHandler.isDragging())) {
    return handled;
  }
  publishLiveTransformVisuals(deps, resolveSingleUseSelection(deps));
  return true;
}

/**
 * Publishes live solid CSG, clone/outline sync, and ruler feedback after a pose
 * sample (pointer or modal keyboard).
 *
 * @param deps Layout services.
 * @param selection Current unlocked selection snapshot.
 */
function publishLiveTransformVisuals(deps: LayoutToolEditorSetupDeps, selection: SingleUseSelectionSnapshot): void {
  publishLayoutTransformLiveVisuals(deps, selection);
}

/** Selection and transform targets for a single-use pointer sample. */
interface SingleUseSelectionSnapshot {
  selectedMeshes: THREE.Mesh[];
  transformTargets: THREE.Object3D[];
}

/**
 * Resolves unlocked selection meshes and gizmo-style transform targets.
 *
 * @param deps Layout services.
 * @returns Selection snapshot for live move or commit.
 */
function resolveSingleUseSelection(deps: LayoutToolEditorSetupDeps): SingleUseSelectionSnapshot {
  const selectedMeshes = filterUnlockedObjects(deps.selectionManager.getAllSelectedObjectsAsArray());
  const transformTargets = resolveTransformTargets(selectedMeshes, deps.selectionManager.getInspectorObjects());
  return { selectedMeshes, transformTargets };
}

/**
 * Visual refresh after modal Enter/Escape commit or cancel for permanent gizmo
 * drags.
 *
 * @param deps Layout services.
 */
function wireAfterDragVisualRefresh(deps: LayoutToolEditorSetupDeps): void {
  deps.transformHandler.setAfterDragVisualsCallback((objects) => {
    deps.onAfterTransformCommit(objects);
  });
}
