/**
 * Captures pointer move and release on window for a drag that began on a
 * specific element. Releasing over toolbars or other UI still ends the drag.
 * Listens on the window that owns the interaction (main editor or detached
 * popup) so multi-monitor panes can drag tools correctly.
 */
export class WindowPointerDragSession {
  private boundMove: ((event: PointerEvent) => void) | null;
  private boundUp: ((event: Event) => void) | null;
  private targetWindow: Window | null;

  /** Creates an inactive window pointer drag session. */
  constructor() {
    this.boundMove = null;
    this.boundUp = null;
    this.targetWindow = null;
  }

  /**
   * Attaches window-level move and release listeners for an active drag.
   * Replaces any previous capture from this session.
   *
   * @param onMove Called for each window pointermove during the drag.
   * @param onUp Called once for pointerup or pointercancel; listeners are
   *   removed before this callback runs.
   * @param targetWindow Window that owns the drag (defaults to the main
   *   window).
   */
  begin(onMove: (event: PointerEvent) => void, onUp: () => void, targetWindow: Window = window): void {
    this.end();
    this.targetWindow = targetWindow;
    this.boundMove = (event) => onMove(event);
    this.boundUp = () => this.finishWithCallback(onUp);
    targetWindow.addEventListener('pointermove', this.boundMove);
    targetWindow.addEventListener('pointerup', this.boundUp);
    targetWindow.addEventListener('pointercancel', this.boundUp);
  }

  /** Removes active listeners if any are attached. */
  end(): void {
    const targetWindow = this.targetWindow ?? window;
    if (this.boundMove) {
      targetWindow.removeEventListener('pointermove', this.boundMove);
    }
    if (this.boundUp) {
      targetWindow.removeEventListener('pointerup', this.boundUp);
      targetWindow.removeEventListener('pointercancel', this.boundUp);
    }
    this.boundMove = null;
    this.boundUp = null;
    this.targetWindow = null;
  }

  /**
   * Returns whether this session currently owns window listeners.
   *
   * @returns True when move/up listeners are attached to window.
   */
  isActive(): boolean {
    return this.boundMove !== null;
  }

  /**
   * Detaches listeners then invokes the release callback.
   *
   * @param onUp Caller-provided release handler.
   */
  private finishWithCallback(onUp: () => void): void {
    this.end();
    onUp();
  }
}
