import { ManagerInput } from './manager_input.js';
import { createDefaultKeyboardShortcutSettings } from '@/settings/store/settings_defaults.js';
import type { KeyboardShortcutSettings } from '@/settings/store/settings_types.js';
import {
  handlerKeyboardShortcutIsTypingInFormField,
  type ActionCallback,
  type NavigationActiveCallback,
  type SelectionModeCallback,
  type ShadingModeCallback,
  type TransformModeCallback,
} from './handler_keyboard_shortcut_types.js';
import {
  handlerKeyboardShortcutDispatchToolKeys,
  handlerKeyboardShortcutHandleClipPlaneKeys,
  handlerKeyboardShortcutHandleDuplicateKey,
  handlerKeyboardShortcutHandleEscapeKey,
  handlerKeyboardShortcutHandleFileKeys,
  handlerKeyboardShortcutHandleUndoRedoKeys,
  type HandlerKeyboardShortcutActionHost,
} from './handler_keyboard_shortcut_actions.js';

export type {
  ActionCallback,
  NavigationActiveCallback,
  SelectionModeCallback,
  ShadingModeCallback,
  TransformModeCallback,
} from './handler_keyboard_shortcut_types.js';

/**
 * Configures keyboard shortcuts for editor operations. Binds window-level
 * keydown events to editor actions. Tool keys (W/E/R/T, WASD-adjacent) are
 * blocked while flying with RMB.
 */
export class HandlerKeyboardShortcut {
  private inputManager: ManagerInput;
  private onTransformMode: TransformModeCallback | null;
  private onDeleteSelected: ActionCallback | null;
  private onUndo: ActionCallback | null;
  private onRedo: ActionCallback | null;
  private onDuplicateSelected: ActionCallback | null;
  private onGroupSelected: ActionCallback | null;
  private onUngroupSelected: ActionCallback | null;
  private onAlignToOrigin: ActionCallback | null;
  private onAxisCycle: ActionCallback | null;
  private onSaveScene: ActionCallback | null;
  private onLoadScene: ActionCallback | null;
  private onExportGlb: ActionCallback | null;
  private onFitToSelection: ActionCallback | null;
  private onFitAllViewports: ActionCallback | null;
  private onShadingMode: ShadingModeCallback | null;
  private onSelectionModeToggle: SelectionModeCallback | null;
  private onSnapIntervalForward: ActionCallback | null;
  private onSnapIntervalBackward: ActionCallback | null;
  private onExtrudeFaces: ActionCallback | null;
  private onClipFlip: ActionCallback | null;
  private onClipCommit: ActionCallback | null;
  private onClipSplit: ActionCallback | null;
  private onEscape: ActionCallback | null;
  private isClipToolActive: (() => boolean) | null;
  private isNavigationActive: NavigationActiveCallback | null;
  private keydownListener: ((event: KeyboardEvent) => void) | null;
  private readonly registeredWindows: Set<Window>;
  private readonly getKeyboardShortcuts: () => KeyboardShortcutSettings;

  /**
   * Returns whether a keyboard code is currently held.
   *
   * @param keyCode KeyboardEvent.code value (e.g. KeyG).
   * @returns True while the key is down.
   */
  isKeyDown(keyCode: string): boolean {
    return this.inputManager.isKeyDown(keyCode);
  }

  /**
   * Creates a new keyboard shortcut handler.
   *
   * @param inputManager The input manager providing key state queries.
   */
  constructor(
    inputManager: ManagerInput,
    getKeyboardShortcuts: () => KeyboardShortcutSettings = createDefaultKeyboardShortcutSettings,
  ) {
    this.inputManager = inputManager;
    this.getKeyboardShortcuts = getKeyboardShortcuts;
    this.onTransformMode = null;
    this.onDeleteSelected = null;
    this.onUndo = null;
    this.onRedo = null;
    this.onDuplicateSelected = null;
    this.onGroupSelected = null;
    this.onUngroupSelected = null;
    this.onAlignToOrigin = null;
    this.onAxisCycle = null;
    this.onSaveScene = null;
    this.onLoadScene = null;
    this.onExportGlb = null;
    this.onFitToSelection = null;
    this.onFitAllViewports = null;
    this.onShadingMode = null;
    this.onSelectionModeToggle = null;
    this.onSnapIntervalForward = null;
    this.onSnapIntervalBackward = null;
    this.onExtrudeFaces = null;
    this.onClipFlip = null;
    this.onClipCommit = null;
    this.onClipSplit = null;
    this.onEscape = null;
    this.isClipToolActive = null;
    this.isNavigationActive = null;
    this.keydownListener = null;
    this.registeredWindows = new Set();
  }

  /**
   * Registers the callback for Escape (deselect / exit tool).
   *
   * @param callback Function to call when Escape is pressed.
   */
  setOnEscape(callback: ActionCallback): void {
    this.onEscape = callback;
  }

  /**
   * Registers a guard that reports when 3D fly navigation is active.
   *
   * @param callback Returns true while RMB fly mode should block tool keys.
   */
  setNavigationActiveCallback(callback: NavigationActiveCallback | null): void {
    this.isNavigationActive = callback;
  }

  /**
   * Registers the callback for transform mode changes.
   *
   * @param callback The function to call when a transform mode key is pressed.
   */
  setOnTransformMode(callback: TransformModeCallback): void {
    this.onTransformMode = callback;
  }

  /**
   * Registers the callback for the delete action.
   *
   * @param callback The function to call when Delete is pressed.
   */
  setOnDeleteSelected(callback: ActionCallback): void {
    this.onDeleteSelected = callback;
  }

  /**
   * Registers the callback for the undo action.
   *
   * @param callback The function to call when the undo shortcut is pressed.
   */
  setOnUndo(callback: ActionCallback): void {
    this.onUndo = callback;
  }

  /**
   * Registers the callback for the redo action.
   *
   * @param callback The function to call when the redo shortcut is pressed.
   */
  setOnRedo(callback: ActionCallback): void {
    this.onRedo = callback;
  }

  /**
   * Registers the callback for the duplicate action.
   *
   * @param callback The function to call when the duplicate shortcut is
   *   pressed.
   */
  setOnDuplicateSelected(callback: ActionCallback): void {
    this.onDuplicateSelected = callback;
  }

  /**
   * Registers the callback for the group action.
   *
   * @param callback The function to call when the group shortcut is pressed.
   */
  setOnGroupSelected(callback: ActionCallback): void {
    this.onGroupSelected = callback;
  }

  /**
   * Registers the callback for the ungroup action.
   *
   * @param callback The function to call when the ungroup shortcut is pressed.
   */
  setOnUngroupSelected(callback: ActionCallback): void {
    this.onUngroupSelected = callback;
  }

  /**
   * Registers the callback for the align to origin action.
   *
   * @param callback The function to call when the align to origin shortcut is
   *   pressed.
   */
  setOnAlignToOrigin(callback: ActionCallback): void {
    this.onAlignToOrigin = callback;
  }

  /**
   * Registers the callback for axis cycling.
   *
   * @param callback The function to call when the axis cycle shortcut is
   *   pressed.
   */
  setOnAxisCycle(callback: ActionCallback): void {
    this.onAxisCycle = callback;
  }

  /**
   * Registers the callback for the save scene action.
   *
   * @param callback The function to call when the save shortcut is pressed.
   */
  setOnSaveScene(callback: ActionCallback): void {
    this.onSaveScene = callback;
  }

  /**
   * Registers the callback for the load scene action.
   *
   * @param callback The function to call when the load shortcut is pressed.
   */
  setOnLoadScene(callback: ActionCallback): void {
    this.onLoadScene = callback;
  }

  /**
   * Registers the callback for the export GLB action.
   *
   * @param callback The function to call when the export shortcut is pressed.
   */
  setOnExportGlb(callback: ActionCallback): void {
    this.onExportGlb = callback;
  }

  /**
   * Registers the callback for the fit-to-selection action.
   *
   * @param callback The function to call when F is pressed.
   */
  setOnFitToSelection(callback: ActionCallback): void {
    this.onFitToSelection = callback;
  }

  /**
   * Registers the callback for the fit-all-viewports action.
   *
   * @param callback The function to call when Shift+F is pressed.
   */
  setOnFitAllViewports(callback: ActionCallback): void {
    this.onFitAllViewports = callback;
  }

  /**
   * Registers the callback for shading mode changes.
   *
   * @param callback The function to call when a shading mode key is pressed.
   */
  setOnShadingMode(callback: ShadingModeCallback): void {
    this.onShadingMode = callback;
  }

  /**
   * Registers the callback for selection mode toggling via Tab key.
   *
   * @param callback The function to call when Tab is pressed.
   */
  setOnSelectionModeToggle(callback: SelectionModeCallback): void {
    this.onSelectionModeToggle = callback;
  }

  /**
   * Registers the callback for cycling snap interval forward.
   *
   * @param callback The function to call when Period is pressed.
   */
  setOnSnapIntervalForward(callback: ActionCallback): void {
    this.onSnapIntervalForward = callback;
  }

  /**
   * Registers the callback for cycling snap interval backward.
   *
   * @param callback The function to call when Comma is pressed.
   */
  setOnSnapIntervalBackward(callback: ActionCallback): void {
    this.onSnapIntervalBackward = callback;
  }

  /**
   * Registers the callback for face extrusion (Shift+E).
   *
   * @param callback The function to call when extrude is triggered.
   */
  setOnExtrudeFaces(callback: ActionCallback): void {
    this.onExtrudeFaces = callback;
  }

  /**
   * Registers clip plane tool keyboard actions and an active-tool guard.
   *
   * @param isActive Returns true while the clip plane tool should own keys.
   * @param onFlip Flip keep side callback.
   * @param onCommit Clip keep callback.
   * @param onSplit Split callback.
   * @param onCancel Cancel callback.
   */
  setClipPlaneShortcuts(
    isActive: () => boolean,
    onFlip: ActionCallback,
    onCommit: ActionCallback,
    onSplit: ActionCallback,
    _onCancel: ActionCallback,
  ): void {
    this.isClipToolActive = isActive;
    this.onClipFlip = onFlip;
    this.onClipCommit = onCommit;
    this.onClipSplit = onSplit;
  }

  /**
   * Registers the main-window keydown listener for all keyboard shortcuts.
   * Detached popups should also call {@link registerOnWindow}.
   */
  register(): void {
    this.registerOnWindow(window);
  }

  /**
   * Registers keyboard shortcuts on an additional window (for example a
   * detached multi-monitor viewport popup). Safe to call repeatedly for the
   * same window.
   *
   * @param targetWindow Window that should dispatch editor shortcuts.
   */
  registerOnWindow(targetWindow: Window): void {
    if (this.registeredWindows.has(targetWindow)) return;
    if (!this.keydownListener) {
      this.keydownListener = (event) => this.handleKeyDown(event);
    }
    targetWindow.addEventListener('keydown', this.keydownListener);
    this.registeredWindows.add(targetWindow);
  }

  /**
   * Removes keyboard shortcut listeners from one window (for example when a
   * detached popup closes).
   *
   * @param targetWindow Window that no longer needs editor shortcuts.
   */
  unregisterFromWindow(targetWindow: Window): void {
    if (!this.keydownListener || !this.registeredWindows.has(targetWindow)) return;
    targetWindow.removeEventListener('keydown', this.keydownListener);
    this.registeredWindows.delete(targetWindow);
    if (this.registeredWindows.size === 0) {
      this.keydownListener = null;
    }
  }

  /** Removes keydown listeners from every registered window. */
  unregister(): void {
    if (!this.keydownListener) {
      this.registeredWindows.clear();
      return;
    }
    for (const targetWindow of this.registeredWindows) {
      targetWindow.removeEventListener('keydown', this.keydownListener);
    }
    this.registeredWindows.clear();
    this.keydownListener = null;
  }

  /**
   * Processes a keydown event and dispatches to the appropriate callback.
   *
   * @param event The keyboard event to process.
   */
  private handleKeyDown(event: KeyboardEvent): void {
    if (handlerKeyboardShortcutIsTypingInFormField(event)) return;
    const host = this.toActionHost();
    if (handlerKeyboardShortcutHandleEscapeKey(host, event)) return;
    handlerKeyboardShortcutHandleFileKeys(host, event);
    handlerKeyboardShortcutHandleUndoRedoKeys(host, event);
    handlerKeyboardShortcutHandleDuplicateKey(host, event);
    if (this.isFlyNavigationBlockingTools()) return;
    if (handlerKeyboardShortcutHandleClipPlaneKeys(host, event)) return;
    handlerKeyboardShortcutDispatchToolKeys(host, event);
  }

  /**
   * Builds the action host bag for keyboard shortcut dispatch helpers.
   *
   * @returns Action host bound to this handler.
   */
  private toActionHost(): HandlerKeyboardShortcutActionHost {
    return {
      matchesShortcut: (event, action) => this.matchesShortcut(event, action),
      runSnapIntervalAction: (action) => this.runSnapIntervalAction(action),
      onTransformMode: this.onTransformMode,
      onDeleteSelected: this.onDeleteSelected,
      onUndo: this.onUndo,
      onRedo: this.onRedo,
      onDuplicateSelected: this.onDuplicateSelected,
      onGroupSelected: this.onGroupSelected,
      onUngroupSelected: this.onUngroupSelected,
      onAlignToOrigin: this.onAlignToOrigin,
      onAxisCycle: this.onAxisCycle,
      onSaveScene: this.onSaveScene,
      onLoadScene: this.onLoadScene,
      onExportGlb: this.onExportGlb,
      onFitToSelection: this.onFitToSelection,
      onFitAllViewports: this.onFitAllViewports,
      onShadingMode: this.onShadingMode,
      onSelectionModeToggle: this.onSelectionModeToggle,
      onSnapIntervalForward: this.onSnapIntervalForward,
      onSnapIntervalBackward: this.onSnapIntervalBackward,
      onExtrudeFaces: this.onExtrudeFaces,
      onClipFlip: this.onClipFlip,
      onClipCommit: this.onClipCommit,
      onClipSplit: this.onClipSplit,
      onEscape: this.onEscape,
      isClipToolActive: this.isClipToolActive,
    };
  }

  /**
   * Returns true when RMB fly mode should suppress tool keys like W/E/R/T/A.
   *
   * @returns True if tool shortcuts must be ignored.
   */
  private isFlyNavigationBlockingTools(): boolean {
    if (this.inputManager.isRightMouseDown()) return true;
    if (this.isNavigationActive && this.isNavigationActive()) return true;
    return false;
  }

  /**
   * Runs a large snap interval change.
   *
   * @param action Callback to invoke three times.
   */
  private runSnapIntervalAction(action: ActionCallback): void {
    for (let stepIndex = 0; stepIndex < 3; stepIndex++) action();
  }

  /**
   * Checks whether an event matches a configured shortcut.
   *
   * @param event Keyboard event to compare.
   * @param action Configured action identifier.
   * @returns True when the key and modifier state match exactly.
   */
  private matchesShortcut(event: KeyboardEvent, action: keyof KeyboardShortcutSettings): boolean {
    const shortcut = this.getKeyboardShortcuts()[action];
    return (
      this.matchesShortcutCode(event, action, shortcut.code) &&
      this.isCtrlDown(event) === shortcut.ctrl &&
      this.isShiftDown(event) === shortcut.shift &&
      this.isAltDown(event) === shortcut.alt &&
      event.metaKey === shortcut.meta
    );
  }

  /**
   * Matches a shortcut code, using displayed letters for undo and redo.
   *
   * @param event Keyboard event to inspect.
   * @param action Shortcut action identifier.
   * @param code Configured keyboard event code.
   * @returns True when the event matches the configured key.
   */
  private matchesShortcutCode(event: KeyboardEvent, action: keyof KeyboardShortcutSettings, code: string): boolean {
    if (action !== 'undo' && action !== 'redo' && action !== 'redo_alternate') {
      return event.code === code;
    }
    const letter = code.startsWith('Key') ? code.slice(3).toLowerCase() : '';
    return letter.length === 1 ? event.key.toLowerCase() === letter : event.code === code;
  }

  /**
   * Returns whether Control is active for an event.
   *
   * @param event Keyboard event to inspect.
   * @returns True when Control is active.
   */
  private isCtrlDown(event: KeyboardEvent): boolean {
    return event.ctrlKey || this.inputManager.isCtrlDown();
  }

  /**
   * Returns whether Shift is active for an event.
   *
   * @param event Keyboard event to inspect.
   * @returns True when Shift is active.
   */
  private isShiftDown(event: KeyboardEvent): boolean {
    return event.shiftKey || this.inputManager.isShiftDown();
  }

  /**
   * Returns whether Alt is active for an event.
   *
   * @param event Keyboard event to inspect.
   * @returns True when Alt is active.
   */
  private isAltDown(event: KeyboardEvent): boolean {
    return event.altKey || this.inputManager.isAltDown();
  }
}
