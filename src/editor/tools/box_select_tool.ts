import type { Vector2 } from 'three';
import { TransformMode } from '@/types/transform_mode.js';
import { Tool } from './tool.js';

/**
 * Default permanent tool (Shape Editor BoxSelectTool). Handles selection-mode
 * interaction and launches single-use transform tools via G / R / S.
 */
export class BoxSelectTool extends Tool {
  private isMarqueeActive: boolean;

  /** Creates a box select tool. */
  constructor() {
    super();
    this.isMarqueeActive = false;
  }

  /**
   * Always busy while dragging a marquee.
   *
   * @returns True while marquee selection is active.
   */
  override isBusy(): boolean {
    return this.isMarqueeActive;
  }

  /** Called when the tool is activated. */
  override onActivate(): void {
    this.isMarqueeActive = false;
    this.refreshSelectPresentation();
  }

  /** Called when the tool is deactivated. */
  override onDeactivate(): void {
    this.isMarqueeActive = false;
  }

  /**
   * Called when the tool receives a global mouse up event.
   *
   * @param button Mouse button index.
   */
  override onGlobalMouseUp(button: number): void {
    if (button === 0) {
      this.isMarqueeActive = false;
    }
  }

  /**
   * Called when the tool receives a mouse drag event.
   *
   * @param button Mouse button index.
   * @param _screenDelta Screen-space movement delta.
   * @param _gridDelta Grid/world-space movement delta.
   */
  override onMouseDrag(button: number, _screenDelta: Vector2, _gridDelta: Vector2): void {
    if (button !== 0 || !this.editor) {
      return;
    }
    if (this.isMarqueeActive) {
      return;
    }
    const distance = this.editor.mouseInitialPosition.distanceTo(this.editor.mousePosition);
    this.isMarqueeActive = distance > 3.0;
  }

  /**
   * Called when the tool receives a key down event.
   *
   * @param keyCode Key code string.
   * @param _event Optional original browser keyboard event.
   * @returns True when a single-use tool was started or a shortcut handled.
   */
  override onKeyDown(keyCode: string, _event?: KeyboardEvent): boolean {
    if (this.isSingleUse) {
      return false;
    }
    if (!this.editor) {
      return false;
    }
    return this.dispatchSingleUseLaunchKeys(keyCode);
  }

  /**
   * Dispatches G / R / S single-use tool launches matching Shape Editor.
   *
   * @param keyCode Key code string.
   * @returns True when handled.
   */
  private dispatchSingleUseLaunchKeys(keyCode: string): boolean {
    const editor = this.editor;
    if (!editor) {
      return false;
    }
    if (keyCode === 'KeyG' && editor.selectedSegmentsCount > 0) {
      editor.useSingleUseTranslateTool();
      return true;
    }
    if (keyCode === 'KeyS' && !editor.isModifierPressed && editor.selectedSegmentsCount > 0) {
      editor.useSingleUseScaleTool();
      return true;
    }
    if (keyCode === 'KeyR' && editor.selectedSegmentsCount > 0) {
      editor.useSingleUseRotateTool();
      return true;
    }
    return false;
  }

  /** Refreshes gizmo presentation for object-select (bounds / neutral). */
  private refreshSelectPresentation(): void {
    const services = this.editor?.getServices();
    if (!services) {
      return;
    }
    services.setWidgetMode(TransformMode.BOUNDS);
    services.refreshGizmoPresentation();
    services.setStatusMessage('Select');
  }
}
