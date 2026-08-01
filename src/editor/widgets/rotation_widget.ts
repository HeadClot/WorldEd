import { Widget } from './widget.js';

/** Represents a viewport rotation widget. */
export class RotationWidget extends Widget {
  /** Called before this widget begins rotating. */
  onBeginRotating: (() => void) | null;

  /**
   * Called whenever this widget is rotated and provides the pivot in grid
   * coordinates and the amount of degrees from -180 to 180.
   */
  onRotation: ((pivotX: number, pivotY: number, degrees: number) => void) | null;

  /** Creates a rotation widget. */
  constructor() {
    super();
    this.onBeginRotating = null;
    this.onRotation = null;
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
      this.onBeginRotating?.();
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
   * Resolves Shape Editor rotation gizmo hit for mouse-down latch.
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
