import type { Vector2 } from 'three';
import type { EditorWindow } from './window/editor_window.js';

/** An object that can have input focus and receive editor events. */
export interface IEditorEventReceiver {
  /** The editor window. */
  editor: EditorWindow | null;

  /**
   * Gets whether the object is busy and has to maintain the input focus, making
   * it impossible to switch to another object.
   *
   * @returns True while exclusive input ownership is required.
   */
  isBusy(): boolean;

  /** Called when the object is activated. */
  onActivate(): void;

  /** Called when the object is deactivated. */
  onDeactivate(): void;

  /** Called when the object is rendered. */
  onRender(): void;

  /**
   * Called when the object receives a mouse down event.
   *
   * @param button Mouse button index (0 left, 1 right, 2 middle).
   */
  onMouseDown(button: number): void;

  /**
   * Called when the object receives a mouse up event.
   *
   * @param button Mouse button index.
   */
  onMouseUp(button: number): void;

  /**
   * Called when the object receives a global mouse up event.
   *
   * @param button Mouse button index.
   */
  onGlobalMouseUp(button: number): void;

  /**
   * Called when the object receives a mouse drag event.
   *
   * @param button Mouse button index.
   * @param screenDelta Screen-space movement delta.
   * @param gridDelta Grid/world-space movement delta.
   */
  onMouseDrag(button: number, screenDelta: Vector2, gridDelta: Vector2): void;

  /**
   * Called when the object receives a global mouse drag event.
   *
   * @param button Mouse button index.
   * @param screenDelta Screen-space movement delta.
   * @param gridDelta Grid/world-space movement delta.
   */
  onGlobalMouseDrag(button: number, screenDelta: Vector2, gridDelta: Vector2): void;

  /**
   * Called when the object receives a mouse move event.
   *
   * @param screenDelta Screen-space movement delta.
   * @param gridDelta Grid/world-space movement delta.
   */
  onMouseMove(screenDelta: Vector2, gridDelta: Vector2): void;

  /**
   * Called when the object receives a mouse scroll event.
   *
   * @param delta Scroll wheel delta.
   * @returns True when the scroll event was consumed.
   */
  onMouseScroll(delta: number): boolean;

  /**
   * Called when the object receives a key down event.
   *
   * @param keyCode Physical or layout-stable key code (KeyboardEvent.code).
   * @param event Optional original browser event (digits, main-row minus,
   *   etc.).
   * @returns True when the key was consumed.
   */
  onKeyDown(keyCode: string, event?: KeyboardEvent): boolean;

  /**
   * Called when the object receives a key up event.
   *
   * @param keyCode Physical or layout-stable key code (KeyboardEvent.code).
   * @returns True when the key was consumed.
   */
  onKeyUp(keyCode: string): boolean;

  /** Called when the object receives input focus. */
  onFocus(): void;

  /** Called when the object loses input focus. */
  onFocusLost(): void;
}
