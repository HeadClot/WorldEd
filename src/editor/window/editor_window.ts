import { Vector2 } from 'three';
import type { IEditorEventReceiver } from '../i_editor_event_receiver.js';
import type { Tool } from '../tools/tool.js';
import type { Widget } from '../widgets/widget.js';
import type { GuiWindow } from '../gui/gui_window.js';
import type { IGuiContainerEventReceiver } from '../gui/gui_container_event_receiver.js';
import type { EditorServices } from './editor_services.js';
import { BoxSelectTool } from '../tools/box_select_tool.js';
import { BoundsTool } from '../tools/bounds_tool.js';
import { TranslateTool } from '../tools/translate_tool.js';
import { RotateTool } from '../tools/rotate_tool.js';
import { ScaleTool } from '../tools/scale_tool.js';
import { FaceSelectTool } from '../tools/face_select/face_select_tool.js';
import type { ClipTool } from '../tools/clip_tool.js';
import { managerMouseCursor } from '@/input/manager_mouse_cursor.js';

/**
 * The editor window owning focus, tools, widgets, and input routing (Focus +
 * Tools + Widgets + input intake).
 */
export class EditorWindow {
  /** The currently active viewport tool. */
  activeTool: Tool | null;

  /** The active event receiver with input focus (e.g. a tool or window etc.). */
  private activeEventReceiver: IEditorEventReceiver | null;

  private readonly widgets: Widget[];
  private readonly guiWindows: GuiWindow[];
  private services: EditorServices | null;

  private boxSelectTool: BoxSelectTool | null;
  private boundsTool: BoundsTool | null;
  private translateTool: TranslateTool | null;
  private rotateTool: RotateTool | null;
  private scaleTool: ScaleTool | null;
  private faceSelectTool: FaceSelectTool | null;
  private clipTool: ClipTool | null;

  /** Current mouse position in screen coordinates. */
  mousePosition: Vector2;

  /** Current mouse position on the grid/world plane. */
  mouseGridPosition: Vector2;

  /** Mouse position at the start of the left-button press. */
  mouseInitialPosition: Vector2;

  /** Grid mouse position at the start of the left-button press. */
  mouseGridInitialPosition: Vector2;

  /** Whether the left mouse button is pressed. */
  isLeftMousePressed: boolean;

  /** Whether the right mouse button is pressed. */
  isRightMousePressed: boolean;

  /** Last DOM event target node (for GUI hit-testing). */
  lastEventTargetNode: Node | null;

  /** Last known pointer client position for single-use start samples. */
  lastPointerClientX: number;

  /** Last known pointer client Y for single-use start samples. */
  lastPointerClientY: number;

  /** Whether a last pointer client position is known. */
  hasLastPointerClient: boolean;

  /**
   * Document that owns the last pointer sample (main app or a detached viewport
   * popup). Client coordinates are local to this document.
   */
  lastPointerOwnerDocument: Document | null;

  /** Creates an empty editor window (call setServices then validateTools). */
  constructor() {
    this.activeTool = null;
    this.activeEventReceiver = null;
    this.widgets = [];
    this.guiWindows = [];
    this.services = null;
    this.boxSelectTool = null;
    this.boundsTool = null;
    this.translateTool = null;
    this.rotateTool = null;
    this.scaleTool = null;
    this.faceSelectTool = null;
    this.clipTool = null;
    this.mousePosition = new Vector2();
    this.mouseGridPosition = new Vector2();
    this.mouseInitialPosition = new Vector2();
    this.mouseGridInitialPosition = new Vector2();
    this.isLeftMousePressed = false;
    this.isRightMousePressed = false;
    this.lastEventTargetNode = null;
    this.lastPointerClientX = 0;
    this.lastPointerClientY = 0;
    this.hasLastPointerClient = false;
    this.lastPointerOwnerDocument = null;
  }

  /**
   * Binds map-editor services used by tools and widgets.
   *
   * @param services Map-editor service bridge.
   */
  setServices(services: EditorServices): void {
    this.services = services;
  }

  /**
   * Returns the bound services, or null before setServices.
   *
   * @returns Services bridge.
   */
  getServices(): EditorServices | null {
    return this.services;
  }

  /**
   * Shape Editor OnRepaint tool/widget path: active tool and widgets OnRender
   * every frame so SetMouseCursor re-issues stay live.
   */
  onRepaint(): void {
    this.drawTool();
    this.drawWidgets();
  }

  /**
   * Shape Editor SetMouseCursor: request a CSS cursor for this frame. Call
   * again every repaint while it should stay active; ManagerMouseCursor.update
   * resets it when nothing re-issues.
   *
   * @param cursorCss CSS cursor value such as `ew-resize`.
   * @param targetElement Element that receives the cursor style.
   */
  setMouseCursor(cursorCss: string, targetElement: HTMLElement): void {
    managerMouseCursor.setMouseCursor(cursorCss, targetElement);
  }

  /** Draws the active tool (Shape Editor DrawTool). */
  private drawTool(): void {
    if (this.activeTool === null) {
      return;
    }
    this.activeTool.onRender();
  }

  /** Draws all widgets (Shape Editor DrawWidgets). */
  private drawWidgets(): void {
    const widgetsCount = this.widgets.length;
    for (let i = 0; i < widgetsCount; i += 1) {
      this.widgets[i]?.onRender();
    }
  }

  /**
   * Whether the mouse is actively in use by a widget or pressed.
   *
   * @returns True when left/right mouse is down or the tool is busy.
   */
  get isMouseBusy(): boolean {
    return this.isLeftMousePressed || this.isRightMousePressed || this.isToolBusy;
  }

  /**
   * Gets whether the active event receiver is a gui container.
   *
   * @returns True when focus is a GUI window.
   */
  get activeEventReceiverIsGuiContainer(): boolean {
    return this.isGuiContainerReceiver(this.activeEventReceiver);
  }

  /**
   * Gets whether the active event receiver is a widget.
   *
   * @returns True when focus is a widget.
   */
  get activeEventReceiverIsWidget(): boolean {
    return this.isWidgetReceiver(this.activeEventReceiver);
  }

  /**
   * Gets whether the active event receiver is a tool.
   *
   * @returns True when focus is a tool.
   */
  get activeEventReceiverIsTool(): boolean {
    return this.isToolReceiver(this.activeEventReceiver);
  }

  /**
   * Checks whether the active tool is busy.
   *
   * @returns True when the focused tool reports IsBusy.
   */
  get isToolBusy(): boolean {
    if (!this.activeEventReceiverIsTool) {
      return false;
    }
    return this.getActiveEventReceiver().isBusy();
  }

  /**
   * Gets whether the active event receiver is busy (exclusive input).
   *
   * @returns True while focus cannot leave the current receiver.
   */
  get isActiveEventReceiverBusy(): boolean {
    return this.getActiveEventReceiver().isBusy();
  }

  /**
   * Notifies that a permanent gizmo/bounds handle drag began (map path).
   * Latches widget wantsActive like Shape Editor `_wantsActive =
   * activeTranslationGizmoState.isActive` and focuses the wanting widget.
   */
  onPermanentGizmoHandleDragBegan(): void {
    this.latchAllWidgetsWantsActiveFromGizmo(true);
    const widget = this.findActiveWidget();
    if (widget) {
      this.trySwitchActiveEventReceiver(widget);
    }
  }

  /**
   * Notifies that a permanent gizmo/bounds handle drag ended. Clears widget
   * wantsActive only (Shape Editor OnGlobalMouseUp on the widget). Focus stays
   * on the widget until the same release's OnMouseUp / next OnMouseDown
   * re-resolves the tool so tool selection does not run on drag release.
   */
  onPermanentGizmoHandleDragEnded(): void {
    this.latchAllWidgetsWantsActiveFromGizmo(false);
  }

  /**
   * Latches wantsActive on every registered widget from gizmo handle state.
   *
   * @param gizmoIsActive True while a permanent handle drag is active.
   */
  private latchAllWidgetsWantsActiveFromGizmo(gizmoIsActive: boolean): void {
    const widgetsCount = this.widgets.length;
    for (let i = 0; i < widgetsCount; i += 1) {
      this.widgets[i]?.latchWantsActiveFromGizmoState(gizmoIsActive);
    }
  }

  /**
   * Returns whether shift is pressed.
   *
   * @returns True when shift is down.
   */
  get isShiftPressed(): boolean {
    return this.services?.isShiftPressed() === true;
  }

  /**
   * Returns whether ctrl is pressed.
   *
   * @returns True when ctrl is down.
   */
  get isCtrlPressed(): boolean {
    return this.services?.isCtrlPressed() === true;
  }

  /**
   * Returns whether any modifier is pressed.
   *
   * @returns True when a modifier is down.
   */
  get isModifierPressed(): boolean {
    return this.services?.isModifierPressed() === true;
  }

  /**
   * Returns whether grid snapping is enabled.
   *
   * @returns True when snapping.
   */
  get isSnapping(): boolean {
    return this.services?.isSnapping() === true;
  }

  /**
   * Returns the grid snap size.
   *
   * @returns Snap increment.
   */
  get gridSnap(): number {
    return this.services?.getGridSnap() ?? 1;
  }

  /**
   * Returns the angle snap in degrees.
   *
   * @returns Angle snap.
   */
  get angleSnap(): number {
    return this.services?.getAngleSnap() ?? 15;
  }

  /**
   * Returns the count of selected objects.
   *
   * @returns Selection size.
   */
  get selectedSegmentsCount(): number {
    return this.services?.getSelectedCount() ?? 0;
  }

  /**
   * Returns the average screen position of the selection.
   *
   * @returns Screen-space average as Vector2.
   */
  get selectedSegmentsAveragePosition(): Vector2 {
    const average = this.services?.getSelectedSegmentsAveragePosition() ?? { x: 0, y: 0 };
    return new Vector2(average.x, average.y);
  }

  /** Ensures that a valid tools always exists, to handle reloads. */
  validateTools(): void {
    if (this.boxSelectTool === null) {
      this.boxSelectTool = new BoxSelectTool();
      this.boundsTool = new BoundsTool();
      this.translateTool = new TranslateTool();
      this.rotateTool = new RotateTool();
      this.scaleTool = new ScaleTool();
      this.faceSelectTool = new FaceSelectTool();
    }
    if (this.activeTool === null) {
      this.switchTool(this.boundsTool as BoundsTool);
    }
  }

  /**
   * Returns the permanent box select tool (selection base only).
   *
   * @returns Box select tool instance.
   */
  getBoxSelectTool(): BoxSelectTool {
    this.validateTools();
    return this.boxSelectTool as BoxSelectTool;
  }

  /**
   * Returns the permanent bounds tool (select + bounds widget).
   *
   * @returns Bounds tool instance.
   */
  getBoundsTool(): BoundsTool {
    this.validateTools();
    return this.boundsTool as BoundsTool;
  }

  /**
   * Returns the permanent translate tool.
   *
   * @returns Translate tool instance.
   */
  getTranslateTool(): TranslateTool {
    this.validateTools();
    return this.translateTool as TranslateTool;
  }

  /**
   * Returns the permanent rotate tool.
   *
   * @returns Rotate tool instance.
   */
  getRotateTool(): RotateTool {
    this.validateTools();
    return this.rotateTool as RotateTool;
  }

  /**
   * Returns the permanent scale tool.
   *
   * @returns Scale tool instance.
   */
  getScaleTool(): ScaleTool {
    this.validateTools();
    return this.scaleTool as ScaleTool;
  }

  /**
   * Returns the permanent face select tool.
   *
   * @returns Face select tool instance.
   */
  getFaceSelectTool(): FaceSelectTool {
    this.validateTools();
    return this.faceSelectTool as FaceSelectTool;
  }

  /**
   * Registers the permanent clip tool (created after handler dependencies
   * exist).
   *
   * @param tool Clip tool instance.
   */
  setClipTool(tool: ClipTool): void {
    this.clipTool = tool;
    tool.editor = this;
  }

  /**
   * Returns the permanent clip tool when registered.
   *
   * @returns Clip tool, or null before registration.
   */
  getClipTool(): ClipTool | null {
    return this.clipTool;
  }

  /**
   * Returns whether the clip tool is the active tool with a live session.
   *
   * @returns True while clipping.
   */
  isClipToolActive(): boolean {
    if (!this.clipTool || this.activeTool !== this.clipTool) {
      return false;
    }
    return this.clipTool.isSessionActive();
  }

  /**
   * Switches the from current tool to the specified tool.
   *
   * @param tool The tool to switch to.
   */
  switchTool(tool: Tool): void {
    if (this.activeTool === tool) {
      return;
    }
    const previousTool = this.activeTool;
    if (previousTool !== null) {
      previousTool.onDeactivate();
    }
    this.clearWidgets();
    if (previousTool?.isSingleUse) {
      this.services?.clearExclusiveViewport();
    }
    tool.editor = this;
    this.activeTool = tool;
    this.activeTool.onActivate();
    this.trySwitchActiveEventReceiver(tool);
    if (tool.isSingleUse) {
      this.services?.pinExclusiveViewport();
    }
  }

  /**
   * This function switches to the specified single-use tool and returns to the
   * current tool when it's done. This is useful for single-use tools that are
   * instantiated with a keyboard binding.
   *
   * @param tool The single-use tool to switch to.
   */
  useTool(tool: Tool): void {
    if (this.activeTool === tool) {
      return;
    }
    tool.parent = this.activeTool;
    this.switchTool(tool);
  }

  /**
   * Tries to switch the active event receiver to the specied receiver. This
   * will fail when the active receiver is busy.
   *
   * @param eventReceiver The event receiver to try and switch to.
   * @returns True when the switch was successful else false.
   */
  trySwitchActiveEventReceiver(eventReceiver: IEditorEventReceiver): boolean {
    if (eventReceiver === null) {
      return false;
    }
    if (this.activeEventReceiver === eventReceiver) {
      return true;
    }
    if (this.activeEventReceiver !== null) {
      if (this.activeEventReceiver.isBusy()) {
        return false;
      }
      this.activeEventReceiver.onFocusLost();
    }
    this.activeEventReceiver = eventReceiver;
    this.activeEventReceiver.editor = this;
    this.activeEventReceiver.onFocus();
    return true;
  }

  /**
   * Gets the active event receiver with input focus and ensures it's never
   * null.
   *
   * @returns The focused event receiver.
   */
  getActiveEventReceiver(): IEditorEventReceiver {
    if (this.activeEventReceiver === null) {
      this.validateTools();
      this.trySwitchActiveEventReceiver(this.boxSelectTool as BoxSelectTool);
    }
    return this.activeEventReceiver as IEditorEventReceiver;
  }

  /**
   * Gets whether the specified event receiver is active with input focus.
   *
   * @param eventReceiver The event receiver to check.
   * @returns True when the receiver has focus.
   */
  isActive(eventReceiver: IEditorEventReceiver): boolean {
    return this.activeEventReceiver === eventReceiver;
  }

  /** Removes all of the widgets. */
  clearWidgets(): void {
    const widgetsCount = this.widgets.length;
    for (let i = 0; i < widgetsCount; i += 1) {
      this.widgets[i]?.onDeactivate();
    }
    this.widgets.length = 0;
  }

  /**
   * Adds a new widget to the viewport.
   *
   * @param widget Widget to add.
   */
  addWidget(widget: Widget): void {
    widget.editor = this;
    this.widgets.push(widget);
    widget.onActivate();
  }

  /**
   * Attempts to find the first widget that reports as being active.
   *
   * @returns The widget instance if found else null.
   */
  findActiveWidget(): Widget | null {
    const widgetsCount = this.widgets.length;
    for (let i = 0; i < widgetsCount; i += 1) {
      const widget = this.widgets[i];
      if (widget && widget.wantsActive) {
        return widget;
      }
    }
    return null;
  }

  /**
   * Returns a copy of the widget list for rendering.
   *
   * @returns Widgets array.
   */
  getWidgets(): readonly Widget[] {
    return this.widgets;
  }

  /**
   * Registers a floating GUI window for focus hit-testing.
   *
   * @param window GUI window instance.
   */
  registerGuiWindow(window: GuiWindow): void {
    if (this.guiWindows.includes(window)) {
      return;
    }
    window.editor = this;
    this.guiWindows.push(window);
  }

  /**
   * Unregisters a floating GUI window.
   *
   * @param rootElement Panel root element.
   */
  unregisterGuiWindowByRoot(rootElement: HTMLElement): void {
    const index = this.guiWindows.findIndex((window) => window.getRootElement() === rootElement);
    if (index < 0) {
      return;
    }
    const [removed] = this.guiWindows.splice(index, 1);
    if (removed && this.activeEventReceiver === removed) {
      if (this.activeTool) {
        this.trySwitchActiveEventReceiver(this.activeTool);
      }
    }
  }

  /**
   * Finds a registered GUI window under the given node.
   *
   * @param node DOM node from an event target.
   * @returns Matching window, or null.
   */
  findWindowAtNode(node: Node | null): GuiWindow | null {
    if (!node) {
      return null;
    }
    for (let i = this.guiWindows.length - 1; i >= 0; i -= 1) {
      const window = this.guiWindows[i];
      if (window && window.containsNode(node)) {
        return window;
      }
    }
    return null;
  }

  /**
   * Finds a registered GUI window under the current mouse event target.
   *
   * @returns Matching window, or null.
   */
  findWindowAtPosition(): GuiWindow | null {
    return this.findWindowAtNode(this.lastEventTargetNode);
  }

  /**
   * Called when the object receives a mouse down event (Shape Editor
   * OnMouseDown).
   *
   * @param button Mouse button index.
   */
  onMouseDown(button: number): void {
    let eventReceiver = this.getActiveEventReceiver();
    if (eventReceiver.isBusy()) {
      eventReceiver.onMouseDown(button);
      return;
    }
    eventReceiver = this.resolveMouseDownEventReceiver(eventReceiver, button);
    eventReceiver.onMouseDown(button);
  }

  /**
   * Called when the object receives a mouse up event.
   *
   * @param button Mouse button index.
   */
  onMouseUp(button: number): void {
    this.routeMouseUpLike(button, false);
  }

  /**
   * Called when the object receives a global mouse up event.
   *
   * @param button Mouse button index.
   */
  onGlobalMouseUp(button: number): void {
    this.routeMouseUpLike(button, true);
  }

  /**
   * Called when the object receives a mouse drag event.
   *
   * @param button Mouse button index.
   * @param screenDelta Screen-space movement delta.
   * @param gridDelta Grid/world-space movement delta.
   */
  onMouseDrag(button: number, screenDelta: Vector2, gridDelta: Vector2): void {
    const eventReceiver = this.getActiveEventReceiver();
    eventReceiver.onMouseDrag(button, screenDelta, gridDelta);
  }

  /**
   * Called when the object receives a global mouse drag event.
   *
   * @param button Mouse button index.
   * @param screenDelta Screen-space movement delta.
   * @param gridDelta Grid/world-space movement delta.
   */
  onGlobalMouseDrag(button: number, screenDelta: Vector2, gridDelta: Vector2): void {
    const eventReceiver = this.getActiveEventReceiver();
    eventReceiver.onGlobalMouseDrag(button, screenDelta, gridDelta);
  }

  /**
   * Called when the object receives a mouse move event.
   *
   * @param screenDelta Screen-space movement delta.
   * @param gridDelta Grid/world-space movement delta.
   */
  onMouseMove(screenDelta: Vector2, gridDelta: Vector2): void {
    const eventReceiver = this.getActiveEventReceiver();
    eventReceiver.onMouseMove(screenDelta, gridDelta);
  }

  /**
   * Called when the object receives a mouse scroll event.
   *
   * @param delta Scroll wheel delta.
   * @returns True when consumed by a receiver.
   */
  onMouseScroll(delta: number): boolean {
    const eventReceiver = this.getActiveEventReceiver();
    return eventReceiver.onMouseScroll(delta);
  }

  /**
   * Called when the object receives a key down event (Shape Editor OnKeyDown).
   *
   * @param keyCode Key code string.
   * @param event Original browser keyboard event for global fallthrough.
   * @returns True when consumed.
   */
  onKeyDown(keyCode: string, event: KeyboardEvent): boolean {
    this.seedPointerStateFromKeyboardEvent(event);
    if (this.shouldSuppressToolKeysForNavigation()) {
      return this.services?.handleGlobalKeyDown(keyCode, event) === true;
    }
    return this.dispatchKeyDownChain(keyCode, event);
  }

  /**
   * Called when the object receives a key up event.
   *
   * @param keyCode Key code string.
   * @returns True when consumed.
   */
  onKeyUp(keyCode: string): boolean {
    if (this.shouldSuppressToolKeysForNavigation()) {
      return false;
    }
    const eventReceiver = this.getActiveEventReceiver();
    if (eventReceiver.isBusy()) {
      eventReceiver.onKeyUp(keyCode);
      return true;
    }
    return eventReceiver.onKeyUp(keyCode);
  }

  /**
   * Updates mouse state from a DOM pointer sample before routing events.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param targetNode Event target node.
   * @param button Mouse button, or -1 when not a button event.
   * @param isDown True on pointer down.
   * @param ownerDocument Document that owns the sample when target resolution
   *   fails across popup realms (main app or detached viewport).
   */
  updateMouseStateFromPointer(
    clientX: number,
    clientY: number,
    targetNode: Node | null,
    button: number,
    isDown: boolean,
    ownerDocument: Document | null = null,
  ): void {
    this.lastEventTargetNode = targetNode;
    this.lastPointerClientX = clientX;
    this.lastPointerClientY = clientY;
    this.hasLastPointerClient = true;
    this.lastPointerOwnerDocument = this.resolveOwnerDocumentFromTarget(targetNode) ?? ownerDocument;
    this.mousePosition.set(clientX, clientY);
    const grid = this.services?.screenPointToGrid(clientX, clientY) ?? { x: clientX, y: clientY };
    this.mouseGridPosition.set(grid.x, grid.y);
    if (button === 0 && isDown) {
      this.mouseInitialPosition.copy(this.mousePosition);
      this.mouseGridInitialPosition.copy(this.mouseGridPosition);
      this.isLeftMousePressed = true;
    }
    if (button === 1 && isDown) {
      this.isRightMousePressed = true;
    }
    if (button === 0 && !isDown) {
      this.isLeftMousePressed = false;
    }
    if (button === 1 && !isDown) {
      this.isRightMousePressed = false;
    }
  }

  /**
   * Projects a screen point into grid coordinates.
   *
   * @param screen Screen point.
   * @returns Grid point.
   */
  screenPointToGrid(screen: Vector2): Vector2 {
    const grid = this.services?.screenPointToGrid(screen.x, screen.y) ?? { x: screen.x, y: screen.y };
    return new Vector2(grid.x, grid.y);
  }

  /**
   * Projects a grid point into screen coordinates.
   *
   * @param grid Grid point.
   * @returns Screen point.
   */
  gridPointToScreen(grid: Vector2): Vector2 {
    const screen = this.services?.gridPointToScreen(grid.x, grid.y) ?? { x: grid.x, y: grid.y };
    return new Vector2(screen.x, screen.y);
  }

  /**
   * Registers an undo operation.
   *
   * @param name Undo label.
   */
  registerUndo(name: string): void {
    this.services?.registerUndo(name);
  }

  /** Discards the last registered undo. */
  discardUndo(): void {
    this.services?.discardUndo();
  }

  /**
   * User switches to the default object tool (bounds select + widget), matching
   * map-editor object select.
   */
  userSwitchToBoxSelectTool(): void {
    this.userSwitchToBoundsTool();
  }

  /** User switches to the permanent bounds tool unless already active. */
  userSwitchToBoundsTool(): void {
    this.switchTool(this.getBoundsTool());
  }

  /** User switches to the face select tool unless already active. */
  userSwitchToFaceSelectTool(): void {
    this.switchTool(this.getFaceSelectTool());
  }

  /** User switches to the translate tool unless already active. */
  userSwitchToTranslateTool(): void {
    this.switchTool(this.getTranslateTool());
  }

  /** User switches to the rotate tool unless already active. */
  userSwitchToRotateTool(): void {
    this.switchTool(this.getRotateTool());
  }

  /** User switches to the scale tool unless already active. */
  userSwitchToScaleTool(): void {
    this.switchTool(this.getScaleTool());
  }

  /**
   * User switches to the clip plane tool when one is registered.
   *
   * @returns True when the clip tool became active.
   */
  userSwitchToClipTool(): boolean {
    if (!this.clipTool) {
      return false;
    }
    this.switchTool(this.clipTool);
    return true;
  }

  /**
   * Instantiates a fresh single-use translate tool (Shape Editor UseTool(new
   * TranslateTool())).
   */
  useSingleUseTranslateTool(): void {
    this.useTool(new TranslateTool());
  }

  /**
   * Instantiates a fresh single-use rotate tool (Shape Editor UseTool(new
   * RotateTool())).
   */
  useSingleUseRotateTool(): void {
    this.useTool(new RotateTool());
  }

  /**
   * Instantiates a fresh single-use scale tool (Shape Editor UseTool(new
   * ScaleTool())).
   */
  useSingleUseScaleTool(): void {
    this.useTool(new ScaleTool());
  }

  /**
   * Resolves the event receiver for a non-busy mouse down (windows → widgets →
   * tool).
   *
   * @param eventReceiver Current focused receiver.
   * @param button Mouse button index.
   * @returns Receiver that should receive OnMouseDown.
   */
  private resolveMouseDownEventReceiver(eventReceiver: IEditorEventReceiver, button: number): IEditorEventReceiver {
    const window = this.findWindowAtPosition();
    if (window !== null) {
      return this.resolveMouseDownForWindow(eventReceiver, window);
    }
    return this.resolveMouseDownForViewport(eventReceiver, button);
  }

  /**
   * Focuses a GUI window under the mouse when allowed.
   *
   * @param eventReceiver Current focused receiver.
   * @param window Hit GUI window.
   * @returns Receiver after focus attempt.
   */
  private resolveMouseDownForWindow(eventReceiver: IEditorEventReceiver, window: GuiWindow): IEditorEventReceiver {
    if (window === eventReceiver) {
      return eventReceiver;
    }
    if (this.trySwitchActiveEventReceiver(window)) {
      return window;
    }
    return eventReceiver;
  }

  /**
   * Informs widgets, then focuses a wanting widget or the active tool.
   *
   * @param eventReceiver Current focused receiver.
   * @param button Mouse button index.
   * @returns Receiver after focus attempt.
   */
  private resolveMouseDownForViewport(eventReceiver: IEditorEventReceiver, button: number): IEditorEventReceiver {
    this.informAllWidgetsMouseDown(button);
    const widget = this.findActiveWidget();
    if (widget !== null) {
      if (this.trySwitchActiveEventReceiver(widget)) {
        return widget;
      }
      return eventReceiver;
    }
    if (this.activeTool && this.trySwitchActiveEventReceiver(this.activeTool)) {
      return this.activeTool;
    }
    return eventReceiver;
  }

  /**
   * Always inform all widgets so they can calculate input focus. This means
   * they get the on mouse down event twice.
   *
   * @param button Mouse button index.
   */
  private informAllWidgetsMouseDown(button: number): void {
    const widgetsCount = this.widgets.length;
    for (let i = 0; i < widgetsCount; i += 1) {
      this.widgets[i]?.onMouseDown(button);
    }
  }

  /**
   * Shared mouse-up / global mouse-up routing (Shape Editor OnMouseUp /
   * OnGlobalMouseUp). Busy receivers keep exclusivity. Widgets that no longer
   * want focus hand off to the active tool without forwarding the up event to
   * the tool — selection runs only when the tool is already the focus
   * receiver.
   *
   * @param button Mouse button index.
   * @param isGlobal True for OnGlobalMouseUp.
   */
  private routeMouseUpLike(button: number, isGlobal: boolean): void {
    let eventReceiver = this.getActiveEventReceiver();
    if (eventReceiver.isBusy()) {
      this.dispatchMouseUpToReceiver(eventReceiver, button, isGlobal);
      return;
    }
    if (this.activeEventReceiverIsWidget) {
      this.routeWidgetMouseUp(eventReceiver, button, isGlobal);
      return;
    }
    this.dispatchMouseUpToReceiver(eventReceiver, button, isGlobal);
  }

  /**
   * Handles widgets that no longer wish to be active (Shape Editor OnMouseUp /
   * OnGlobalMouseUp widget branch). The tool is focused after the widget
   * receives the up event; the tool does not also receive that up event.
   *
   * @param eventReceiver Current widget receiver.
   * @param button Mouse button index.
   * @param isGlobal True for global mouse up.
   */
  private routeWidgetMouseUp(eventReceiver: IEditorEventReceiver, button: number, isGlobal: boolean): void {
    const widget = eventReceiver as Widget;
    if (!widget.wantsActive) {
      this.dispatchMouseUpToReceiver(eventReceiver, button, isGlobal);
      if (this.activeTool) {
        this.trySwitchActiveEventReceiver(this.activeTool);
      }
      return;
    }
    this.dispatchMouseUpToReceiver(eventReceiver, button, isGlobal);
  }

  /**
   * Dispatches mouse up or global mouse up to a receiver.
   *
   * @param eventReceiver Target receiver.
   * @param button Mouse button index.
   * @param isGlobal True for global mouse up.
   */
  private dispatchMouseUpToReceiver(eventReceiver: IEditorEventReceiver, button: number, isGlobal: boolean): void {
    if (isGlobal) {
      eventReceiver.onGlobalMouseUp(button);
      return;
    }
    eventReceiver.onMouseUp(button);
  }

  /**
   * Seeds last-pointer state from the keyboard event window so single-use tools
   * started over a detached viewport use that window's coordinates.
   *
   * @param event Browser keyboard event.
   */
  private seedPointerStateFromKeyboardEvent(event: KeyboardEvent): void {
    const ownerDocument = this.resolveOwnerDocumentFromKeyboardEvent(event);
    if (!ownerDocument) {
      return;
    }
    this.lastPointerOwnerDocument = ownerDocument;
    const last = this.services?.getLastPointerClientPosition(ownerDocument);
    if (!last) {
      return;
    }
    this.lastPointerClientX = last.clientX;
    this.lastPointerClientY = last.clientY;
    this.hasLastPointerClient = true;
  }

  /**
   * Resolves the document that owns a keyboard event.
   *
   * @param event Browser keyboard event.
   * @returns Owner document, or null.
   */
  private resolveOwnerDocumentFromKeyboardEvent(event: KeyboardEvent): Document | null {
    if (event.view?.document) {
      return event.view.document;
    }
    return this.resolveOwnerDocumentFromTarget(event.target);
  }

  /**
   * Resolves the document that owns an event target node.
   *
   * @param target Event target node.
   * @returns Owner document, or null.
   */
  private resolveOwnerDocumentFromTarget(target: EventTarget | Node | null): Document | null {
    if (!target || typeof target !== 'object') {
      return null;
    }
    const nodeLike = target as { nodeType?: number; ownerDocument?: Document | null };
    if (nodeLike.nodeType === 9) {
      return target as Document;
    }
    if (nodeLike.ownerDocument) {
      return nodeLike.ownerDocument;
    }
    return null;
  }

  /**
   * Dispatches key-down through busy exclusivity, GUI fallthrough, and tool
   * defaults.
   *
   * @param keyCode Key code string.
   * @param event Browser keyboard event.
   * @returns True when consumed.
   */
  private dispatchKeyDownChain(keyCode: string, event: KeyboardEvent): boolean {
    if (this.services?.isPermanentGizmoHandleDragActive() === true) {
      return this.dispatchKeyDownDuringPermanentGizmoHandleDrag(keyCode, event);
    }
    const eventReceiver = this.getActiveEventReceiver();
    if (eventReceiver.isBusy()) {
      eventReceiver.onKeyDown(keyCode, event);
      return true;
    }
    let used = eventReceiver.onKeyDown(keyCode, event);
    if (!used) {
      used = this.tryFallThroughFromGuiToTool(keyCode, event);
    }
    if (!used && this.activeEventReceiverIsTool) {
      used = this.dispatchToolModeDefaultShortcuts(keyCode, event);
    }
    if (!used) {
      used = this.services?.handleGlobalKeyDown(keyCode, event) === true;
    }
    return used;
  }

  /**
   * Handles key-down while a permanent gizmo handle is held. Blocks tool switch
   * and single-use launch (Shape Editor widget wantsActive busy exclusivity)
   * and routes only modal transform keys.
   *
   * @param keyCode Key code string.
   * @param event Browser keyboard event.
   * @returns True when consumed (always while the handle drag is active).
   */
  private dispatchKeyDownDuringPermanentGizmoHandleDrag(keyCode: string, event: KeyboardEvent): boolean {
    this.services?.handleModalKeyDown(keyCode, event);
    if (this.services?.isPermanentGizmoHandleDragActive() !== true) {
      this.onPermanentGizmoHandleDragEnded();
    }
    return true;
  }

  /**
   * When a gui container event receiver did not use the keyboard event, try to
   * switch focus back to the active tool and retry.
   *
   * @param keyCode Key code string.
   * @param event Original browser keyboard event.
   * @returns True when the tool consumed the key.
   */
  private tryFallThroughFromGuiToTool(keyCode: string, event: KeyboardEvent): boolean {
    if (!this.activeEventReceiverIsGuiContainer) {
      return false;
    }
    if (this.isModifierKeyCode(keyCode) || this.isMouseBusy || keyCode === '') {
      return false;
    }
    if (!this.activeTool || !this.trySwitchActiveEventReceiver(this.activeTool)) {
      return false;
    }
    return this.activeTool.onKeyDown(keyCode, event);
  }

  /**
   * In tool mode provides default keyboard shortcuts (Shape Editor OnKeyDown
   * tool map).
   *
   * @param keyCode Key code string.
   * @param event Browser keyboard event.
   * @returns True when a default tool shortcut handled the key.
   */
  private dispatchToolModeDefaultShortcuts(keyCode: string, event: KeyboardEvent): boolean {
    if (keyCode === 'KeyQ') {
      this.userSwitchToBoxSelectTool();
      return true;
    }
    if (keyCode === 'KeyW') {
      this.userSwitchToTranslateTool();
      return true;
    }
    if (keyCode === 'KeyR') {
      this.userSwitchToRotateTool();
      return true;
    }
    if (keyCode === 'KeyS' && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      this.userSwitchToScaleTool();
      return true;
    }
    return false;
  }

  /**
   * Returns whether navigation should suppress tool key handling.
   *
   * @returns True when fly/pan is active and no tool is exclusively busy.
   */
  private shouldSuppressToolKeysForNavigation(): boolean {
    if (!this.services?.isNavigationBlockingTools()) {
      return false;
    }
    if (this.isActiveEventReceiverBusy) {
      return false;
    }
    return true;
  }

  /**
   * Returns whether the key code is only a modifier key.
   *
   * @param keyCode Key code string.
   * @returns True for bare Shift/Ctrl/Alt/Meta.
   */
  private isModifierKeyCode(keyCode: string): boolean {
    return (
      keyCode === 'ShiftLeft' ||
      keyCode === 'ShiftRight' ||
      keyCode === 'ControlLeft' ||
      keyCode === 'ControlRight' ||
      keyCode === 'AltLeft' ||
      keyCode === 'AltRight' ||
      keyCode === 'MetaLeft' ||
      keyCode === 'MetaRight'
    );
  }

  /**
   * Returns whether a receiver is a GUI container.
   *
   * @param receiver Event receiver, or null.
   * @returns True when GUI container.
   */
  private isGuiContainerReceiver(receiver: IEditorEventReceiver | null): boolean {
    if (!receiver) {
      return false;
    }
    return (
      'getRootElement' in receiver && typeof (receiver as IGuiContainerEventReceiver).getRootElement === 'function'
    );
  }

  /**
   * Returns whether a receiver is a widget.
   *
   * @param receiver Event receiver, or null.
   * @returns True when widget.
   */
  private isWidgetReceiver(receiver: IEditorEventReceiver | null): boolean {
    if (!receiver) {
      return false;
    }
    return 'wantsActive' in receiver;
  }

  /**
   * Returns whether a receiver is a tool.
   *
   * @param receiver Event receiver, or null.
   * @returns True when tool.
   */
  private isToolReceiver(receiver: IEditorEventReceiver | null): boolean {
    if (!receiver) {
      return false;
    }
    return 'isSingleUse' in receiver && 'parent' in receiver;
  }
}
