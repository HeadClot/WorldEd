import { keyboardShortcutCodeFromEvent } from './keyboard_event_match.js';

/**
 * Tracks global keyboard and mouse button state for the editor. Clears stuck
 * keys when the window loses focus so navigation cannot run away. Also tracks
 * the last known pointer position for single-use transform tools (G/R/S style).
 * Letter keys are stored under layout-stable codes so QWERTZ Y/Z match
 * {@link isKeyDown} queries using KeyY / KeyZ.
 */
export class ManagerInput {
  private readonly targetWindow: Window;
  private keyStates: Map<string, boolean>;
  private mouseButtonStates: Map<number, boolean>;
  private keyDownListener: ((event: KeyboardEvent) => void) | null;
  private keyUpListener: ((event: KeyboardEvent) => void) | null;
  private pointerDownListener: ((event: PointerEvent) => void) | null;
  private pointerUpListener: ((event: PointerEvent) => void) | null;
  private pointerMoveListener: ((event: PointerEvent) => void) | null;
  private blurListener: (() => void) | null;
  private visibilityListener: (() => void) | null;
  private isDisposed: boolean;
  private lastPointerClientX: number;
  private lastPointerClientY: number;
  private hasLastPointerPosition: boolean;

  /**
   * Creates a new input manager and registers keyboard and mouse listeners.
   *
   * @param targetWindow Window that owns the listeners (main or detached
   *   popup).
   */
  constructor(targetWindow: Window = window) {
    this.targetWindow = targetWindow;
    this.keyStates = new Map();
    this.mouseButtonStates = new Map();
    this.keyDownListener = null;
    this.keyUpListener = null;
    this.pointerDownListener = null;
    this.pointerUpListener = null;
    this.pointerMoveListener = null;
    this.blurListener = null;
    this.visibilityListener = null;
    this.isDisposed = false;
    this.lastPointerClientX = 0;
    this.lastPointerClientY = 0;
    this.hasLastPointerPosition = false;
    this.setupKeyboardListeners();
    this.setupMouseListeners();
    this.setupFocusListeners();
  }

  /** Registers window-level keyboard event listeners to track key states. */
  private setupKeyboardListeners(): void {
    this.keyDownListener = (event) => {
      this.recordKeyState(event, true);
    };
    this.keyUpListener = (event) => {
      this.recordKeyState(event, false);
    };
    this.targetWindow.addEventListener('keydown', this.keyDownListener);
    this.targetWindow.addEventListener('keyup', this.keyUpListener);
  }

  /**
   * Records physical and layout-stable codes for a key event.
   *
   * @param event Browser keyboard event.
   * @param isDown True on keydown, false on keyup.
   */
  private recordKeyState(event: KeyboardEvent, isDown: boolean): void {
    this.keyStates.set(event.code, isDown);
    const logicalCode = keyboardShortcutCodeFromEvent(event);
    if (logicalCode !== event.code) {
      this.keyStates.set(logicalCode, isDown);
    }
  }

  /** Registers window-level mouse button listeners for navigation guards. */
  private setupMouseListeners(): void {
    this.pointerDownListener = (event) => {
      this.mouseButtonStates.set(event.button, true);
      this.recordPointerClientPosition(event.clientX, event.clientY);
    };
    this.pointerUpListener = (event) => {
      this.mouseButtonStates.set(event.button, false);
      this.recordPointerClientPosition(event.clientX, event.clientY);
    };
    this.pointerMoveListener = (event) => {
      this.recordPointerClientPosition(event.clientX, event.clientY);
    };
    this.targetWindow.addEventListener('pointerdown', this.pointerDownListener);
    this.targetWindow.addEventListener('pointerup', this.pointerUpListener);
    this.targetWindow.addEventListener('pointermove', this.pointerMoveListener);
  }

  /**
   * Stores the latest pointer client coordinates.
   *
   * @param clientX Viewport client X.
   * @param clientY Viewport client Y.
   */
  private recordPointerClientPosition(clientX: number, clientY: number): void {
    this.lastPointerClientX = clientX;
    this.lastPointerClientY = clientY;
    this.hasLastPointerPosition = true;
  }

  /**
   * Returns the last known pointer client position when available.
   *
   * @returns Client coordinates, or null before any pointer event.
   */
  getLastPointerClientPosition(): { clientX: number; clientY: number } | null {
    if (!this.hasLastPointerPosition) {
      return null;
    }
    return { clientX: this.lastPointerClientX, clientY: this.lastPointerClientY };
  }

  /** Clears all input state when the window loses focus or is hidden. */
  private setupFocusListeners(): void {
    this.blurListener = () => this.reset();
    this.visibilityListener = () => {
      if (this.targetWindow.document.hidden) {
        this.reset();
      }
    };
    this.targetWindow.addEventListener('blur', this.blurListener);
    this.targetWindow.document.addEventListener('visibilitychange', this.visibilityListener);
  }

  /**
   * Checks whether a specific key is currently pressed.
   *
   * @param keyCode The keyboard event code string to check.
   * @returns True if the key is held down.
   */
  isKeyDown(keyCode: string): boolean {
    return this.keyStates.get(keyCode) === true;
  }

  /**
   * Checks whether a mouse button is currently pressed.
   *
   * @param button The mouse button index (0 left, 1 middle, 2 right).
   * @returns True if the button is held.
   */
  isMouseButtonDown(button: number): boolean {
    return this.mouseButtonStates.get(button) === true;
  }

  /**
   * Returns true while right-mouse navigation is active in the 3D viewport.
   *
   * @returns True if the right mouse button is held.
   */
  isRightMouseDown(): boolean {
    return this.isMouseButtonDown(2);
  }

  /**
   * Checks whether either Shift key is currently pressed.
   *
   * @returns True if left or right shift is held down.
   */
  isShiftDown(): boolean {
    return this.keyStates.get('ShiftLeft') === true || this.keyStates.get('ShiftRight') === true;
  }

  /**
   * Checks whether either Ctrl key is currently pressed.
   *
   * @returns True if left or right control is held down.
   */
  isCtrlDown(): boolean {
    return this.keyStates.get('ControlLeft') === true || this.keyStates.get('ControlRight') === true;
  }

  /**
   * Checks whether either Alt key is currently pressed.
   *
   * @returns True if left or right alt is held down.
   */
  isAltDown(): boolean {
    return this.keyStates.get('AltLeft') === true || this.keyStates.get('AltRight') === true;
  }

  /** Clears all tracked key and mouse button states. Useful for test resets. */
  reset(): void {
    this.keyStates.clear();
    this.mouseButtonStates.clear();
  }

  /**
   * Removes all global listeners and clears tracked input state. Safe to call
   * more than once.
   */
  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.removeKeyboardListeners();
    this.removeMouseListeners();
    this.removeFocusListeners();
    this.reset();
  }

  /** Unregisters keyboard window listeners. */
  private removeKeyboardListeners(): void {
    if (this.keyDownListener) {
      this.targetWindow.removeEventListener('keydown', this.keyDownListener);
      this.keyDownListener = null;
    }
    if (this.keyUpListener) {
      this.targetWindow.removeEventListener('keyup', this.keyUpListener);
      this.keyUpListener = null;
    }
  }

  /** Unregisters mouse window listeners. */
  private removeMouseListeners(): void {
    if (this.pointerDownListener) {
      this.targetWindow.removeEventListener('pointerdown', this.pointerDownListener);
      this.pointerDownListener = null;
    }
    if (this.pointerUpListener) {
      this.targetWindow.removeEventListener('pointerup', this.pointerUpListener);
      this.pointerUpListener = null;
    }
    if (this.pointerMoveListener) {
      this.targetWindow.removeEventListener('pointermove', this.pointerMoveListener);
      this.pointerMoveListener = null;
    }
  }

  /** Unregisters focus and visibility listeners. */
  private removeFocusListeners(): void {
    if (this.blurListener) {
      this.targetWindow.removeEventListener('blur', this.blurListener);
      this.blurListener = null;
    }
    if (this.visibilityListener) {
      this.targetWindow.document.removeEventListener('visibilitychange', this.visibilityListener);
      this.visibilityListener = null;
    }
  }
}
