import { Widget } from './widget.js';

/** Represents a viewport scale widget. */
export class ScaleWidget extends Widget {
  /** Called before this widget begins scaling. */
  onBeginScaling: (() => void) | null;

  /**
   * Called whenever this scale widget is scaled and provides the pivot in grid
   * coordinates and the scale.
   */
  onMouseDragCallback: ((pivotX: number, pivotY: number, scaleX: number, scaleY: number) => void) | null;

  /** Creates a scale widget. */
  constructor() {
    super();
    this.onBeginScaling = null;
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
      this.onBeginScaling?.();
    }
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
   * Resolves Shape Editor ScaleGizmoState.isActive for mouse-down latch.
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
