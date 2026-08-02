import type { Vector2 } from 'three';
import { Widget } from './widget.js';

/**
 * Bounds gizmo widget matching Shape Editor TranslationWidget structure:
 * OnRender updates hover/cursors; OnMouseDown latches wantsActive from hover
 * then begins drag only when focused (second OnMouseDown after focus switch).
 */
export class BoundsWidget extends Widget {
  /** Creates a bounds widget. */
  constructor() {
    super();
  }

  /** Shape Editor OnRender: refresh hover state and SetMouseCursor every frame. */
  override onRender(): void {
    if (!this.visible || this.isOtherActive) {
      return;
    }
    this.refreshBoundsHoverFromEditorPointer();
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
    const gizmoIsActive = this.probeBoundsGizmoUnderPointer();
    this.latchWantsActiveFromGizmoState(gizmoIsActive);
    if (!this.isActive || !gizmoIsActive) {
      return;
    }
    const started = this.tryBeginBoundsDragFromEditorPointer();
    if (!started) {
      this.clearWantsActiveLatch();
    }
  }

  /**
   * Shape Editor OnGlobalMouseUp: clear wantsActive latch.
   *
   * @param button Mouse button index.
   */
  override onGlobalMouseUp(button: number): void {
    if (button === 0) {
      this.clearWantsActiveLatch();
    }
  }

  /**
   * Unused for bounds (drag is owned by transform handler window capture).
   *
   * @param _button Mouse button index.
   * @param _screenDelta Screen-space movement delta.
   * @param _gridDelta Grid/world-space movement delta.
   */
  override onMouseDrag(_button: number, _screenDelta: Vector2, _gridDelta: Vector2): void {}

  /**
   * Probes whether a bounds handle or face is under the pointer without
   * starting a drag (Shape Editor gizmo hover state).
   *
   * @returns True when a bounds control is under the pointer.
   */
  private probeBoundsGizmoUnderPointer(): boolean {
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
   * Begins a permanent bounds drag under the pointer.
   *
   * @returns True when a drag started.
   */
  private tryBeginBoundsDragFromEditorPointer(): boolean {
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

  /** Updates bounds hover highlight and resize cursors from the editor mouse. */
  private refreshBoundsHoverFromEditorPointer(): void {
    const services = this.editor?.getServices();
    if (!services || !this.editor) {
      return;
    }
    services.updateBoundsHoverAtClientPoint(this.editor.lastPointerClientX, this.editor.lastPointerClientY);
  }
}
