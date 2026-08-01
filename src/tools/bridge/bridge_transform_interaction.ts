import * as THREE from 'three';
import { Viewport3D } from '@/viewports/core/viewport_3d.js';
import { Viewport2D } from '@/viewports/core/viewport_2d.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { ControllerSelectionVisual } from '@/selection/object/controller_selection_visual.js';
import { GizmoTransform } from '@/transform/gizmo/gizmo_transform.js';
import { GizmoHandle } from '@/transform/gizmo/gizmo_handle.js';
import { TransformExecutor } from '@/transform/core/transform_executor.js';
import { HandlerTransform } from '@/transform/core/handler_transform.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { ManagerInput } from '@/input/manager_input.js';
import { ManagerViewportSync } from '@/layout/viewport/manager_viewport_sync.js';
import { PanelProperties } from '@/ui/properties/panel_properties.js';
import { filterUnlockedObjects } from '@/utils/object_lock.js';
import { resolveTransformTargets } from '@/selection/object/resolve_transform_targets.js';
import { WindowPointerDragSession } from '@/utils/session_window_pointer_drag.js';
import { SelectionClickThrough } from '@/selection/object/selection_click_through.js';
import { getCadViewPlaneForKind } from '@/viewports/core/viewport_editor.js';
import { TransformMode } from '@/types/transform_mode.js';

/**
 * Dependencies required to route viewport pointer events into the transform
 * gizmo.
 */
export interface DependenciesBridgeTransformInteraction {
  selectionManager: ManagerSelection;
  selectionVisualController: ControllerSelectionVisual;
  transformGizmo: GizmoTransform;
  transformHandler: HandlerTransform;
  transformExecutor: TransformExecutor;
  gridSnap: GridSnap;
  inputManager: ManagerInput;
  viewportSyncManager: ManagerViewportSync;
  propertiesPanel: PanelProperties;
  worldObject: THREE.Group;
  getUserSnapEnabled: () => boolean;
  /** Returns true when gizmo handles should follow object-local axes. */
  isTransformSpaceLocal: () => boolean;
  /**
   * Duplicates the current selection and selects the created objects. Used to
   * begin an Alt-drag with duplicates instead of the originals.
   */
  onDuplicateSelectedForDrag?: () => void;
  /**
   * Required hook after a transform drag commits. Must refresh 2D clones,
   * selection outlines, brush hulls, CAD rulers, gizmo, and solid CSG — the
   * same contract as inspector edits and undo/redo
   * ({@link refreshSceneVisualsAfterTransformCommit}).
   *
   * @param objects Objects that received pose edits (meshes and/or groups).
   */
  onAfterTransformCommit: (objects: THREE.Object3D[]) => void;
  /**
   * Optional hook during transform drag for live solid CSG preview.
   *
   * @param meshes Meshes currently being transformed (selection meshes; solid
   *   live rebuild keys off brush/result meshes under the selection).
   */
  onTransformsLive?: (meshes: THREE.Mesh[]) => void;
  /**
   * When false, gizmo/bounds picks are ignored so other tools (face select) can
   * receive pointer events. Defaults to always enabled when omitted.
   */
  isInteractionEnabled?: () => boolean;
  /**
   * Optional CAD ruler feedback for selection dimensions and drag deltas.
   *
   * @param meshes Meshes involved in the interaction.
   * @param phase Drag lifecycle phase.
   */
  onRulerTransformFeedback?: (meshes: THREE.Mesh[], phase: 'begin' | 'move' | 'end') => void;
  /**
   * Called when a permanent gizmo/bounds handle drag begins so the editor can
   * latch widget wantsActive (Shape Editor gizmo isActive).
   */
  onPermanentGizmoHandleDragBegan?: () => void;
  /**
   * Called when a permanent gizmo/bounds handle drag ends so the editor can
   * clear widget wantsActive and restore tool focus.
   */
  onPermanentGizmoHandleDragEnded?: () => void;
}

/**
 * Bridges viewport pointer events to the transform handler and keeps clone
 * positions, selection visuals, and properties in sync during drag.
 */
export class BridgeTransformInteraction {
  private deps: DependenciesBridgeTransformInteraction;
  private windowDragSession: WindowPointerDragSession;
  private activeDragViewport: Viewport3D | Viewport2D | null;
  private pendingSelectionClickEvent: MouseEvent | null;
  private pendingSelectionClickViewport: Viewport3D | Viewport2D | null;

  /**
   * Creates a transform interaction bridge.
   *
   * @param deps Shared editor systems used during gizmo interaction.
   */
  constructor(deps: DependenciesBridgeTransformInteraction) {
    this.deps = deps;
    this.windowDragSession = new WindowPointerDragSession();
    this.activeDragViewport = null;
    this.pendingSelectionClickEvent = null;
    this.pendingSelectionClickViewport = null;
  }

  /**
   * Wires transform callbacks on all viewports.
   *
   * @param viewports Viewports that can drive the transform gizmo.
   */
  wireViewports(viewports: Array<Viewport3D | Viewport2D>): void {
    viewports.forEach((viewport) => {
      viewport.setTransformCallback((event) => this.onTransformEvent(event, viewport));
    });
  }

  /**
   * Handles a transform event from a viewport.
   *
   * @param event The pointer event.
   * @param viewport The viewport that received the event.
   * @returns True if the event was consumed by the transform handler.
   */
  onTransformEvent(event: MouseEvent, viewport: Viewport3D | Viewport2D): boolean {
    if (!this.deps.selectionManager) return false;
    if (this.shouldSkipDisabledInteraction()) return false;
    if (!this.hasGizmoHandles()) return false;
    if (!this.isGizmoInteractable(viewport)) return false;
    if (this.shouldSkipGizmoForMultiSelect(event)) return false;
    const eventParams = this.buildTransformEventParams(viewport);
    return this.dispatchTransformEvent(
      event.type,
      eventParams.camera,
      eventParams.pickElement,
      event,
      eventParams.handles,
      eventParams.selectedObjects,
      viewport.getGizmoGroup(),
      viewport,
    );
  }

  /**
   * Skips starting new gizmo picks when transform interaction is disabled (for
   * example while face selection mode is active). Ongoing drags still receive
   * move and up events so they can finish cleanly.
   *
   * @returns True when the event must not begin a new transform interaction.
   */
  private shouldSkipDisabledInteraction(): boolean {
    if (this.deps.transformHandler.isDragging()) return false;
    if (!this.deps.isInteractionEnabled) return false;
    return this.deps.isInteractionEnabled() === false;
  }

  /**
   * Returns whether the viewport gizmo is visible and should receive picks.
   *
   * @param viewport The viewport whose gizmo group is checked.
   * @returns True when the gizmo group exists and is visible.
   */
  private isGizmoInteractable(viewport: Viewport3D | Viewport2D): boolean {
    const gizmoGroup = viewport.getGizmoGroup();
    if (!gizmoGroup) return false;
    const wanted = gizmoGroup.userData['gizmoWantedVisible'];
    if (wanted === true) return true;
    if (wanted === false) return false;
    return gizmoGroup.visible === true;
  }

  /**
   * On pointer-down with multi-select modifiers, skip gizmo/bounds picks so
   * object selection can hit meshes behind the bounds volume. Shift is never
   * used for bounds resize (fly boost / multi-select / precision snap-off).
   *
   * @param event The pointer event being dispatched.
   * @returns True when the gizmo must not consume this event.
   */
  private shouldSkipGizmoForMultiSelect(event: MouseEvent): boolean {
    if (event.type !== 'pointerdown') return false;
    if (this.deps.transformHandler.isDragging()) return false;
    return event.shiftKey || event.ctrlKey || event.metaKey;
  }

  /**
   * Checks whether the transform gizmo can receive picks. Bounds mode has no
   * cube handles — face pick planes are the interaction surface.
   *
   * @returns True when handles exist or Bounds mode is active.
   */
  private hasGizmoHandles(): boolean {
    return this.deps.transformGizmo.getHandles().length > 0;
  }

  /**
   * Gathers viewport and selection data for transform event dispatch.
   *
   * @param viewport The viewport providing camera and pickElement.
   * @returns An object containing transform event parameters.
   */
  private buildTransformEventParams(viewport: Viewport3D | Viewport2D): {
    camera: THREE.Camera;
    pickElement: HTMLElement;
    handles: GizmoHandle[];
    selectedObjects: THREE.Mesh[];
  } {
    return {
      camera: viewport.getCamera(),
      pickElement: viewport.getContentElement(),
      handles: this.deps.transformGizmo.getHandles(),
      selectedObjects: filterUnlockedObjects(this.deps.selectionManager.getAllSelectedObjectsAsArray()),
    };
  }

  /**
   * Dispatches a transform event to the appropriate handler method.
   *
   * @param eventType The pointer event type string.
   * @param camera The viewport camera.
   * @param pickElement DOM pick target for NDC.
   * @param event The pointer event.
   * @param handles The current gizmo handles.
   * @param selectedObjects The selected meshes for the transform.
   * @param gizmoGroup The viewport gizmo group for raycasting.
   * @returns True if the event was consumed.
   */
  private dispatchTransformEvent(
    eventType: string,
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    handles: GizmoHandle[],
    selectedObjects: THREE.Mesh[],
    gizmoGroup: THREE.Group | null,
    viewport: Viewport3D | Viewport2D,
  ): boolean {
    if (eventType === 'pointerdown') {
      return this.beginTransformPointerDown(camera, pickElement, event, handles, selectedObjects, gizmoGroup, viewport);
    }
    if (eventType === 'pointermove') {
      return this.handleTransformPointerMove(camera, pickElement, event, viewport);
    }
    if (eventType === 'pointerup') {
      return this.handleTransformPointerUp();
    }
    return false;
  }

  /**
   * Starts a gizmo/bounds drag and captures window move/up so release outside
   * the canvas still ends the drag.
   *
   * @param camera The viewport camera.
   * @param pickElement DOM pick target for NDC.
   * @param event The pointerdown event.
   * @param handles The current gizmo handles.
   * @param selectedObjects The selected meshes for the transform.
   * @param gizmoGroup The viewport gizmo group for raycasting.
   * @param viewport The viewport that received the pointerdown.
   * @returns True when a drag was started.
   */
  private beginTransformPointerDown(
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    handles: GizmoHandle[],
    selectedObjects: THREE.Mesh[],
    gizmoGroup: THREE.Group | null,
    viewport: Viewport3D | Viewport2D,
  ): boolean {
    const transformTargets = this.resolveDragTargets(selectedObjects);
    const pivot = this.computeCurrentPivot();
    const kind = typeof viewport.getViewportKind === 'function' ? viewport.getViewportKind() : undefined;
    const viewPlane = kind ? getCadViewPlaneForKind(kind) : 'xyz';
    this.deps.transformHandler.onPointerDown(
      camera,
      pickElement,
      event,
      handles,
      transformTargets,
      pivot,
      gizmoGroup ?? new THREE.Group(),
      viewPlane,
    );
    if (!this.deps.transformHandler.isDragging()) return false;
    const dragObjects = this.prepareAltDragDuplicates(event, camera, pickElement, viewport);
    if (dragObjects.length === 0) return false;
    this.pendingSelectionClickEvent = event;
    this.pendingSelectionClickViewport = viewport;
    this.attachWindowDragCapture(viewport, event);
    this.deps.onRulerTransformFeedback?.(dragObjects, 'begin');
    this.deps.onPermanentGizmoHandleDragBegan?.();
    return true;
  }

  /**
   * Replaces a valid Alt-drag session with an equivalent session targeting
   * newly duplicated objects.
   *
   * @param event The pointerdown event that began the drag.
   * @param camera The active viewport camera.
   * @param pickElement The active viewport pickElement.
   * @param viewport Viewport that owns the refreshed gizmo clone.
   * @returns Objects targeted by the active drag, or an empty array on failure.
   */
  private prepareAltDragDuplicates(
    event: MouseEvent,
    camera: THREE.Camera,
    pickElement: HTMLElement,
    viewport: Viewport3D | Viewport2D,
  ): THREE.Mesh[] {
    const current = filterUnlockedObjects(this.deps.selectionManager.getAllSelectedObjectsAsArray());
    if (!event.altKey || !this.deps.onDuplicateSelectedForDrag) return current;
    this.deps.transformHandler.onPointerUp(this.computeCurrentPivot(), this.resolveDragTargets(current));
    this.deps.onDuplicateSelectedForDrag();
    const duplicates = filterUnlockedObjects(this.deps.selectionManager.getAllSelectedObjectsAsArray());
    if (duplicates.length === 0) return duplicates;
    this.restartTransformDrag(event, camera, pickElement, duplicates, viewport);
    return this.deps.transformHandler.isDragging() ? duplicates : [];
  }

  /**
   * Starts the transform session again with duplicated selection targets.
   *
   * @param event Original pointerdown event.
   * @param camera Active viewport camera.
   * @param pickElement Active viewport pickElement.
   * @param duplicates Newly created selection targets.
   * @param viewport Viewport that owns the refreshed gizmo clone.
   */
  private restartTransformDrag(
    event: MouseEvent,
    camera: THREE.Camera,
    pickElement: HTMLElement,
    duplicates: THREE.Mesh[],
    viewport: Viewport3D | Viewport2D,
  ): void {
    const kind = typeof viewport.getViewportKind === 'function' ? viewport.getViewportKind() : undefined;
    const viewPlane = kind ? getCadViewPlaneForKind(kind) : 'xyz';
    this.deps.transformHandler.onPointerDown(
      camera,
      pickElement,
      event,
      this.deps.transformGizmo.getHandles(),
      this.resolveDragTargets(duplicates),
      this.computeCurrentPivot(),
      viewport.getGizmoGroup() ?? new THREE.Group(),
      viewPlane,
    );
  }

  /**
   * Routes subsequent move/up events through the originating viewport even when
   * the pointer leaves the canvas (toolbar, side panels, etc.). Uses capture-
   * phase window listeners and element pointer capture so a single mouse-up
   * always ends the drag.
   *
   * @param viewport The viewport that started the drag.
   * @param event The pointerdown that began the drag.
   */
  private attachWindowDragCapture(viewport: Viewport3D | Viewport2D, event: MouseEvent): void {
    this.activeDragViewport = viewport;
    const pointerEvent = event as PointerEvent;
    const pickElement = viewport.getContentElement();
    const pointerCapture =
      typeof pointerEvent.pointerId === 'number' ? { element: pickElement, pointerId: pointerEvent.pointerId } : null;
    this.windowDragSession.begin(
      (moveEvent) => this.onWindowDragMove(moveEvent),
      () => this.handleTransformPointerUp(),
      this.resolveViewportOwnerWindow(viewport),
      pointerCapture,
    );
  }

  /**
   * Resolves the Window that owns a viewport's pick element. Falls back to the
   * main window when the content element is a test mock without a document.
   *
   * @param viewport Viewport that started the drag.
   * @returns Owner window for pointer capture.
   */
  private resolveViewportOwnerWindow(viewport: Viewport3D | Viewport2D): Window {
    const content = viewport.getContentElement?.() as HTMLElement | undefined;
    const ownerDocument = content?.ownerDocument;
    return ownerDocument?.defaultView ?? window;
  }

  /**
   * Applies a window-level pointermove using the viewport that began the drag.
   *
   * @param event The window pointermove event.
   */
  private onWindowDragMove(event: PointerEvent): void {
    if (!this.activeDragViewport) return;
    this.handleTransformPointerMove(
      this.activeDragViewport.getCamera(),
      this.activeDragViewport.getContentElement(),
      event,
      this.activeDragViewport,
    );
  }

  /**
   * Handles pointer move: Bounds Shift-hover when idle, or live drag updates.
   *
   * @param camera The viewport camera.
   * @param pickElement DOM pick target for NDC.
   * @param event The pointer event.
   * @param viewport Viewport that received the move (for gizmo group).
   * @returns True if the event was consumed.
   */
  private handleTransformPointerMove(
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    viewport: Viewport3D | Viewport2D,
  ): boolean {
    if (!this.deps.transformHandler.isDragging()) {
      return this.updateIdleBoundsHover(camera, pickElement, event, viewport);
    }
    const pivot = this.computeCurrentPivot();
    const selected = filterUnlockedObjects(Array.from(this.deps.selectionManager.getSelectedObjects()));
    const transformTargets = this.resolveDragTargets(selected);
    this.updateSnapFromShiftKey(event);
    this.deps.transformHandler.onPointerMove(camera, pickElement, event, pivot, transformTargets);
    this.deps.onTransformsLive?.(selected);
    this.deps.viewportSyncManager.syncCloneTransformsForWorldObjects(transformTargets);
    this.deps.selectionVisualController.syncDuringTransform();
    this.refreshGizmoFrameDuringDrag(transformTargets);
    this.deps.transformGizmo.updateBoundsFromMeshes(selected, camera);
    this.deps.onRulerTransformFeedback?.(selected, 'move');
    this.refreshPropertiesPanelTransform();
    return true;
  }

  /**
   * Updates gizmo pivot/orientation during drag only when the mode allows it.
   * Rotate freezes the gizmo frame so local axes do not re-frame mid-drag and
   * throw the rotation axis.
   *
   * @param transformTargets Live transform targets for orientation resolve.
   */
  private refreshGizmoFrameDuringDrag(transformTargets: THREE.Object3D[]): void {
    const mode = this.deps.transformGizmo.getMode();
    if (mode === TransformMode.ROTATE) {
      return;
    }
    this.deps.transformGizmo.setPivot(this.computeCurrentPivot());
    this.deps.transformGizmo.setOrientation(this.resolveGizmoOrientation(transformTargets));
  }

  /**
   * Updates Bounds face hover highlight when idle (no modifier required).
   * Suppressed while the camera is panning or flying so navigation stays
   * clean.
   *
   * @param camera The viewport camera.
   * @param pickElement DOM pick target for NDC.
   * @param event The pointer event.
   * @param viewport Viewport providing the gizmo clone.
   * @returns False so the event remains free for other tools; highlight is a
   *   side effect only.
   */
  private updateIdleBoundsHover(
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    viewport: Viewport3D | Viewport2D,
  ): boolean {
    if (this.shouldSuppressBoundsHover(event, viewport)) {
      this.deps.transformHandler.clearBoundsHover(pickElement);
      return false;
    }
    const gizmoGroup = viewport.getGizmoGroup() ?? new THREE.Group();
    const kind = typeof viewport.getViewportKind === 'function' ? viewport.getViewportKind() : undefined;
    const viewPlane = kind ? getCadViewPlaneForKind(kind) : 'xyz';
    this.deps.transformHandler.updateBoundsHover(camera, pickElement, event, gizmoGroup, viewPlane);
    return false;
  }

  /**
   * True when secondary/middle mouse is held or the viewport reports camera
   * navigation (2D pan / 3D fly).
   *
   * @param event Pointer event with button bitfield.
   * @param viewport Source viewport for navigation state.
   * @returns True when bounds hover should be cleared and skipped.
   */
  private shouldSuppressBoundsHover(event: MouseEvent, viewport: Viewport3D | Viewport2D): boolean {
    if (this.isNavigationMouseButtonHeld(event)) return true;
    return this.isViewportCameraNavigating(viewport);
  }

  /**
   * True when right or middle mouse button is held (pan / fly navigation).
   *
   * @param event Pointer event providing the buttons bitfield.
   * @returns True when a navigation mouse button is down.
   */
  private isNavigationMouseButtonHeld(event: MouseEvent): boolean {
    const rightOrMiddleMask = 2 | 4;
    return (event.buttons & rightOrMiddleMask) !== 0;
  }

  /**
   * Reads camera navigation state from the viewport when available.
   *
   * @param viewport Viewport that may expose isCameraNavigating.
   * @returns True during pan or fly navigation.
   */
  private isViewportCameraNavigating(viewport: Viewport3D | Viewport2D): boolean {
    if (typeof viewport.isCameraNavigating !== 'function') return false;
    return viewport.isCameraNavigating();
  }

  /**
   * Resolves gizmo orientation from transform space and selection. Global (or
   * multi-select) uses world axes; Local uses the object's rotation.
   *
   * @param selected Selected meshes.
   * @returns World quaternion for transform handles.
   */
  private resolveGizmoOrientation(selected: THREE.Object3D[]): THREE.Quaternion {
    if (!this.deps.isTransformSpaceLocal() || selected.length !== 1) {
      return new THREE.Quaternion();
    }
    selected[0]!.updateMatrixWorld(true);
    const orientation = new THREE.Quaternion();
    selected[0]!.getWorldQuaternion(orientation);
    return orientation;
  }

  /**
   * Handles the pointer up phase of a transform drag. Clears window capture so
   * later viewport moves do not resume the drag. Bounds face clicks without
   * movement cycle nested object selection.
   *
   * @returns True if the event was consumed.
   */
  private handleTransformPointerUp(): boolean {
    if (!this.deps.transformHandler.isDragging()) {
      this.clearWindowDragCapture();
      return false;
    }
    const pivot = this.computeCurrentPivot();
    const selectedObjects = filterUnlockedObjects(this.deps.selectionManager.getAllSelectedObjectsAsArray());
    const transformTargets = this.resolveDragTargets(selectedObjects);
    const selectionClick = this.deps.transformHandler.onPointerUp(pivot, transformTargets);
    const clickEvent = this.pendingSelectionClickEvent;
    const clickViewport = this.pendingSelectionClickViewport;
    this.clearWindowDragCapture();
    this.deps.onPermanentGizmoHandleDragEnded?.();
    if (selectionClick) {
      this.deps.onRulerTransformFeedback?.(selectedObjects, 'end');
      this.applyBoundsFaceSelectionClick(clickEvent, clickViewport);
      return true;
    }
    this.commitTransformAfterDrag(transformTargets);
    return true;
  }

  /**
   * Maps selection meshes to gizmo drag targets. Solid result meshes resolve to
   * the solid model root. Outliner hierarchy groups (including solid CSG
   * groups) transform as units so group local pose updates instead of
   * scattering child mesh poses.
   *
   * @param selected Selected content meshes.
   * @returns Objects that should receive pose edits.
   */
  private resolveDragTargets(selected: readonly THREE.Mesh[]): THREE.Object3D[] {
    return resolveTransformTargets(selected, this.deps.selectionManager.getInspectorObjects());
  }

  /**
   * Commits a completed transform drag through the shared layout visual refresh
   * (clones, selection, rulers, gizmo, solid finalize).
   *
   * @param transformTargets Objects that received pose edits.
   */
  private commitTransformAfterDrag(transformTargets: THREE.Object3D[]): void {
    this.deps.onAfterTransformCommit(transformTargets);
  }

  /**
   * Applies click-through selection after a bounds face press with no drag.
   *
   * @param event The original pointerdown event used for picking.
   * @param viewport The viewport that received the press.
   */
  private applyBoundsFaceSelectionClick(event: MouseEvent | null, viewport: Viewport3D | Viewport2D | null): void {
    if (!event || !viewport) return;
    if (typeof viewport.getObjectPickStack !== 'function') return;
    const stack = viewport.getObjectPickStack(event);
    const picked = SelectionClickThrough.pickFromStack(stack, this.deps.selectionManager);
    if (!picked) return;
    this.deps.selectionManager.selectFromClick(picked, false, false);
  }

  /** Drops window-level drag listeners and the originating viewport reference. */
  private clearWindowDragCapture(): void {
    this.windowDragSession.end();
    this.activeDragViewport = null;
    this.pendingSelectionClickEvent = null;
    this.pendingSelectionClickViewport = null;
  }

  /** Pushes live object transforms into the properties inspector. */
  private refreshPropertiesPanelTransform(): void {
    this.deps.propertiesPanel.refreshBoundObject();
  }

  /**
   * Temporarily disables snap while Shift is held (precision mode). Restores
   * the user snap preference when Shift is released. Prefers the live pointer
   * event so detached popup windows work without sharing the main
   * InputManager.
   *
   * @param event Optional pointer event providing shiftKey for this sample.
   */
  private updateSnapFromShiftKey(event?: MouseEvent): void {
    const shiftHeld = event?.shiftKey === true || this.deps.inputManager.isShiftDown();
    if (shiftHeld) {
      this.deps.gridSnap.setEnabled(false);
      return;
    }
    this.deps.gridSnap.setEnabled(this.deps.getUserSnapEnabled());
  }

  /**
   * Computes the current pivot point from selected objects.
   *
   * @returns The pivot vector for transform operations.
   */
  private computeCurrentPivot(): THREE.Vector3 {
    const selected = filterUnlockedObjects(Array.from(this.deps.selectionManager.getSelectedObjects()));
    return this.deps.transformExecutor.computePivot(this.resolveDragTargets(selected));
  }
}
