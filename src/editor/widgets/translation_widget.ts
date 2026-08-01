import type { Vector2 } from 'three';
import { Widget } from './widget.js';

/** Represents a viewport translation widget. */
export class TranslationWidget extends Widget {
  /** Called before this widget begins translating. */
  onBeginTranslating: (() => void) | null;

  /**
   * Called whenever this translation widget is dragged by the mouse and
   * provides the screen delta and grid delta position changes.
   */
  onMouseDragCallback: ((screenDelta: Vector2, gridDelta: Vector2) => void) | null;

  /** Creates a translation widget. */
  constructor() {
    super();
    this.onBeginTranslating = null;
    this.onMouseDragCallback = null;
  }

  /**
   * Called when the widget receives a mouse down event.
   *
   * @param button Mouse button index.
   */
  override onMouseDown(button: number): void {
    if (!this.visible) {
      return;
    }
    if (button !== 0) {
      return;
    }
    this.latchWantsActiveFromGizmoState(this.resolveGizmoIsActiveOnMouseDown());
    if (this.isActive) {
      this.onBeginTranslating?.();
    }
  }

  /**
   * Called when the widget receives a mouse drag event.
   *
   * @param button Mouse button index.
   * @param screenDelta Screen-space movement delta.
   * @param gridDelta Grid/world-space movement delta.
   */
  override onMouseDrag(button: number, screenDelta: Vector2, gridDelta: Vector2): void {
    if (!this.visible || !this.isActive) {
      return;
    }
    if (button !== 0) {
      return;
    }
    this.onMouseDragCallback?.(screenDelta, gridDelta);
  }

  /**
   * Called when the widget receives a global mouse up event.
   *
   * @param button Mouse button index.
   */
  override onGlobalMouseUp(button: number): void {
    if (button === 0) {
      this.clearWantsActiveLatch();
    }
  }

  /**
   * Resolves Shape Editor TranslationGizmoState.isActive for mouse-down latch.
   *
   * @returns True when a permanent gizmo handle is active under the pointer.
   */
  private resolveGizmoIsActiveOnMouseDown(): boolean {
    const services = this.editor?.getServices();
    if (!services) {
      return false;
    }
    return services.isPermanentGizmoHandleDragActive();
  }
}
