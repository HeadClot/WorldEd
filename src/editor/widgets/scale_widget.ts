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
   * Shape Editor OnMouseDown: called twice (inform-all then focused). Always
   * latches wantsActive from current gizmo hover; begins drag only when
   * focused.
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
    const gizmoIsActive = this.probeGizmoUnderPointer();
    this.latchWantsActiveFromGizmoState(gizmoIsActive);
    if (!this.isActive || !gizmoIsActive) {
      return;
    }
    const started = this.tryBeginGizmoDragFromEditorPointer();
    if (!started) {
      this.clearWantsActiveLatch();
      return;
    }
    this.onBeginScaling?.();
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
   * Probes whether a scale handle is under the pointer without starting a drag.
   *
   * @returns True when a handle is under the pointer.
   */
  private probeGizmoUnderPointer(): boolean {
    const services = this.editor?.getServices();
    if (!services || !this.editor) {
      return false;
    }
    return services.probePermanentGizmoUnderPointer(this.editor.lastPointerClientX, this.editor.lastPointerClientY, {
      shiftKey: services.isShiftPressed(),
      ctrlKey: services.isCtrlPressed(),
      altKey: services.isAltPressed(),
      metaKey: services.isCtrlPressed(),
    });
  }

  /**
   * Begins a permanent scale gizmo drag under the pointer.
   *
   * @returns True when a drag started.
   */
  private tryBeginGizmoDragFromEditorPointer(): boolean {
    const services = this.editor?.getServices();
    if (!services || !this.editor) {
      return false;
    }
    return services.tryBeginPermanentGizmoDragFromEditorPointer(
      this.editor.lastPointerClientX,
      this.editor.lastPointerClientY,
      {
        shiftKey: services.isShiftPressed(),
        ctrlKey: services.isCtrlPressed(),
        altKey: services.isAltPressed(),
        metaKey: services.isCtrlPressed(),
      },
    );
  }
}
