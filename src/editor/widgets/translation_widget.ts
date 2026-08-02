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
    this.onBeginTranslating?.();
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
   * Probes whether a translate handle is under the pointer without starting a
   * drag (Shape Editor gizmo hover state).
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
   * Begins a permanent translate gizmo drag under the pointer.
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
