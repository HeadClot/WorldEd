import type { Vector2 } from 'three';
import { Tool } from '../tool.js';

/**
 * Permanent face selection tool. Owns face pick/paint/UV smear mouse input so
 * tools that do not inherit BoxSelectTool never object-select by accident.
 */
export class FaceSelectTool extends Tool {
  private strokeActive: boolean;

  /** Creates a face select tool. */
  constructor() {
    super();
    this.strokeActive = false;
  }

  /**
   * Busy while a face paint or UV smear stroke is live.
   *
   * @returns True during an active face stroke.
   */
  override isBusy(): boolean {
    if (this.strokeActive) {
      return true;
    }
    return this.editor?.getServices()?.isFaceSelectStrokeActive() === true;
  }

  /** Called when the tool is activated. */
  override onActivate(): void {
    this.strokeActive = false;
    this.editor?.getServices()?.enterFaceSelectionMode();
    this.editor?.getServices()?.setStatusMessage('Face select');
  }

  /** Called when the tool is deactivated. */
  override onDeactivate(): void {
    this.strokeActive = false;
    this.editor?.getServices()?.endFaceSelectPointerUp();
    this.editor?.getServices()?.leaveFaceSelectionMode();
  }

  /**
   * Called when the tool receives a mouse down event.
   *
   * @param button Mouse button index.
   */
  override onMouseDown(button: number): void {
    if (button !== 0 || !this.editor) {
      return;
    }
    const services = this.editor.getServices();
    if (!services) {
      return;
    }
    const started = services.beginFaceSelectPointerDown(
      this.editor.lastPointerClientX,
      this.editor.lastPointerClientY,
      this.editor.isShiftPressed,
      this.editor.isCtrlPressed,
    );
    this.strokeActive = started;
  }

  /**
   * Called when the tool receives a mouse move event.
   *
   * @param _screenDelta Screen-space movement delta.
   * @param _gridDelta Grid/world-space movement delta.
   */
  override onMouseMove(_screenDelta: Vector2, _gridDelta: Vector2): void {
    this.forwardFacePointerMoveIfStrokeActive();
  }

  /**
   * Called when the tool receives a mouse drag event.
   *
   * @param button Mouse button index.
   * @param _screenDelta Screen-space movement delta.
   * @param _gridDelta Grid/world-space movement delta.
   */
  override onMouseDrag(button: number, _screenDelta: Vector2, _gridDelta: Vector2): void {
    if (button !== 0) {
      return;
    }
    this.forwardFacePointerMoveIfStrokeActive();
  }

  /**
   * Called when the tool receives a global mouse drag event.
   *
   * @param button Mouse button index.
   * @param screenDelta Screen-space movement delta.
   * @param gridDelta Grid/world-space movement delta.
   */
  override onGlobalMouseDrag(button: number, screenDelta: Vector2, gridDelta: Vector2): void {
    this.onMouseDrag(button, screenDelta, gridDelta);
  }

  /**
   * Called when the tool receives a global mouse up event.
   *
   * @param button Mouse button index.
   */
  override onGlobalMouseUp(button: number): void {
    if (button !== 0) {
      return;
    }
    this.strokeActive = false;
    this.editor?.getServices()?.endFaceSelectPointerUp();
  }

  /** Forwards move samples to face paint while a stroke is active. */
  private forwardFacePointerMoveIfStrokeActive(): void {
    if (!this.strokeActive || !this.editor) {
      return;
    }
    const services = this.editor.getServices();
    if (!services) {
      return;
    }
    services.continueFaceSelectPointerMove(this.editor.lastPointerClientX, this.editor.lastPointerClientY, 1);
  }
}
