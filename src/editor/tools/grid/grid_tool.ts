import type { Vector2 } from 'three';
import { Tool } from '../tool.js';

/**
 * Permanent grid tool. Face and edge align picks are single-use while armed,
 * but the tool stays non-busy so the exclusive mouse shield stays off.
 */
export class GridTool extends Tool {
  /** Creates a grid tool. */
  constructor() {
    super();
  }

  /**
   * Align arm is not exclusive-busy: viewport clicks must route through the
   * normal idle path so the first click after arming is not swallowed.
   *
   * @returns Always false for the grid tool.
   */
  override isBusy(): boolean {
    return false;
  }

  /** Called when the tool is activated. */
  override onActivate(): void {
    this.pinInteractiveViewports();
    this.editor?.getServices()?.setStatusMessage('Grid tools · grid and camera orientation are independent');
  }

  /** Called when the tool is deactivated. */
  override onDeactivate(): void {
    this.editor?.getServices()?.disarmGridAlignPick();
    this.editor?.getServices()?.clearExclusiveViewport();
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
    if (!services || !services.isGridAlignPickArmed()) {
      return;
    }
    const clientX = this.editor.lastPointerClientX;
    const clientY = this.editor.lastPointerClientY;
    const ownerDocument = this.editor.lastPointerOwnerDocument;
    const pane =
      services.resolveInteractiveViewportAtClientPoint(clientX, clientY, ownerDocument) ??
      this.resolveActivePaneFallback(services);
    if (!pane) {
      services.setStatusMessage('Click in a 3D viewport');
      return;
    }
    services.tryGridAlignPickAtPointer(clientX, clientY);
  }

  /**
   * Updates face or edge hover preview while align pick is armed.
   *
   * @param _screenDelta Screen-space movement delta.
   * @param _gridDelta Grid/world-space movement delta.
   */
  override onMouseMove(_screenDelta: Vector2, _gridDelta: Vector2): void {
    this.updateAlignHoverFromLastPointer();
  }

  /**
   * Continues hover while the pointer is dragged.
   *
   * @param button Mouse button index.
   * @param screenDelta Screen-space movement delta.
   * @param gridDelta Grid/world-space movement delta.
   */
  override onMouseDrag(button: number, screenDelta: Vector2, gridDelta: Vector2): void {
    if (button !== 0) {
      return;
    }
    this.onMouseMove(screenDelta, gridDelta);
  }

  /**
   * Continues hover during global drag routing.
   *
   * @param button Mouse button index.
   * @param screenDelta Screen-space movement delta.
   * @param gridDelta Grid/world-space movement delta.
   */
  override onGlobalMouseDrag(button: number, screenDelta: Vector2, gridDelta: Vector2): void {
    this.onMouseDrag(button, screenDelta, gridDelta);
  }

  /**
   * Cancels an armed align pick on Escape.
   *
   * @param keyCode Key code string.
   * @param _event Optional original browser keyboard event.
   * @returns True when the key was handled.
   */
  override onKeyDown(keyCode: string, _event?: KeyboardEvent): boolean {
    if (keyCode !== 'Escape') {
      return false;
    }
    const services = this.editor?.getServices();
    if (!services?.isGridAlignPickArmed()) {
      return false;
    }
    services.disarmGridAlignPick();
    return true;
  }

  /** Pins every interactive pane for idle viewport click routing. */
  private pinInteractiveViewports(): void {
    const services = this.editor?.getServices();
    if (!services) {
      return;
    }
    services.pinExclusiveViewportDomain(services.getInteractiveViewportPickElements());
  }

  /** Updates align hover from the last pointer sample. */
  private updateAlignHoverFromLastPointer(): void {
    const services = this.editor?.getServices();
    if (!services || !this.editor || !services.isGridAlignPickArmed()) {
      return;
    }
    services.updateGridAlignHoverAtPointer(this.editor.lastPointerClientX, this.editor.lastPointerClientY);
  }

  /**
   * Falls back to the layout active pane when the pointer is not over content.
   *
   * @param services Editor services.
   * @returns Active pane pick context, or null.
   */
  private resolveActivePaneFallback(
    services: NonNullable<ReturnType<NonNullable<typeof this.editor>['getServices']>>,
  ): { camera: import('three').Camera; pickElement: HTMLElement } | null {
    const camera = services.getActiveCamera();
    const pickElement = services.getActivePickElement();
    if (!camera || !pickElement) {
      return null;
    }
    return { camera, pickElement };
  }
}
