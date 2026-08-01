/**
 * Captures pointer move and release on window for a drag that began on a
 * specific element. Releasing over toolbars or other UI still ends the drag.
 * Listeners use the capture phase so a single pointerup always ends the drag
 * even if other document handlers stop bubble propagation. Also ends on blur or
 * document hide so OS popups cannot leave a stuck drag.
 */
export class WindowPointerDragSession {
  private boundMove: ((event: PointerEvent) => void) | null;
  private boundUp: ((event: Event) => void) | null;
  private boundBlur: (() => void) | null;
  private boundVisibility: (() => void) | null;
  private targetWindow: Window | null;
  private captureElement: HTMLElement | null;
  private capturePointerId: number | null;

  /** Creates an inactive window pointer drag session. */
  constructor() {
    this.boundMove = null;
    this.boundUp = null;
    this.boundBlur = null;
    this.boundVisibility = null;
    this.targetWindow = null;
    this.captureElement = null;
    this.capturePointerId = null;
  }

  /**
   * Attaches window-level capture-phase move and release listeners for a drag.
   *
   * @param onMove Called for each window pointermove during the drag.
   * @param onUp Called once for pointerup, pointercancel, blur, or document
   *   hide; listeners are removed before this callback runs.
   * @param targetWindow Window that owns the drag (defaults to the main
   *   window).
   * @param pointerCapture Optional element + pointer id for setPointerCapture
   *   so release is delivered even when the cursor leaves the element.
   */
  begin(
    onMove: (event: PointerEvent) => void,
    onUp: () => void,
    targetWindow: Window = window,
    pointerCapture: { element: HTMLElement; pointerId: number } | null = null,
  ): void {
    this.end();
    this.targetWindow = targetWindow;
    this.boundMove = (event) => onMove(event);
    this.boundUp = () => this.finishWithCallback(onUp);
    this.boundBlur = () => this.finishWithCallback(onUp);
    this.boundVisibility = () => {
      if (!this.documentIsHidden(targetWindow)) {
        return;
      }
      this.finishWithCallback(onUp);
    };
    this.attachCaptureListeners(targetWindow);
    this.applyPointerCapture(pointerCapture);
  }

  /** Removes active listeners if any are attached. */
  end(): void {
    const targetWindow = this.targetWindow ?? window;
    this.releasePointerCapture();
    this.detachCaptureListeners(targetWindow);
    this.boundMove = null;
    this.boundUp = null;
    this.boundBlur = null;
    this.boundVisibility = null;
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
   * Attaches capture-phase window listeners.
   *
   * @param targetWindow Window that owns the drag.
   */
  private attachCaptureListeners(targetWindow: Window): void {
    if (this.boundMove) {
      targetWindow.addEventListener('pointermove', this.boundMove, true);
    }
    if (this.boundUp) {
      targetWindow.addEventListener('pointerup', this.boundUp, true);
      targetWindow.addEventListener('pointercancel', this.boundUp, true);
    }
    if (this.boundBlur) {
      targetWindow.addEventListener('blur', this.boundBlur);
    }
    if (this.boundVisibility) {
      targetWindow.document?.addEventListener('visibilitychange', this.boundVisibility);
    }
  }

  /**
   * Detaches capture-phase window listeners.
   *
   * @param targetWindow Window that owns the drag.
   */
  private detachCaptureListeners(targetWindow: Window): void {
    if (this.boundMove) {
      targetWindow.removeEventListener('pointermove', this.boundMove, true);
    }
    if (this.boundUp) {
      targetWindow.removeEventListener('pointerup', this.boundUp, true);
      targetWindow.removeEventListener('pointercancel', this.boundUp, true);
    }
    if (this.boundBlur) {
      targetWindow.removeEventListener('blur', this.boundBlur);
    }
    if (this.boundVisibility) {
      targetWindow.document?.removeEventListener('visibilitychange', this.boundVisibility);
    }
  }

  /**
   * Applies element pointer capture when the browser supports it.
   *
   * @param pointerCapture Element and pointer id from the starting pointerdown.
   */
  private applyPointerCapture(pointerCapture: { element: HTMLElement; pointerId: number } | null): void {
    if (!pointerCapture) {
      return;
    }
    if (typeof pointerCapture.element.setPointerCapture !== 'function') {
      return;
    }
    try {
      pointerCapture.element.setPointerCapture(pointerCapture.pointerId);
      this.captureElement = pointerCapture.element;
      this.capturePointerId = pointerCapture.pointerId;
    } catch {
      this.captureElement = null;
      this.capturePointerId = null;
    }
  }

  /** Releases element pointer capture if this session holds it. */
  private releasePointerCapture(): void {
    const element = this.captureElement;
    const pointerId = this.capturePointerId;
    this.captureElement = null;
    this.capturePointerId = null;
    if (!element || pointerId === null) {
      return;
    }
    if (typeof element.releasePointerCapture !== 'function') {
      return;
    }
    try {
      if (element.hasPointerCapture?.(pointerId)) {
        element.releasePointerCapture(pointerId);
      }
    } catch {
      return;
    }
  }

  /**
   * Detaches listeners then invokes the release callback once.
   *
   * @param onUp Caller-provided release handler.
   */
  private finishWithCallback(onUp: () => void): void {
    if (!this.isActive()) {
      return;
    }
    this.end();
    onUp();
  }

  /**
   * Returns whether the document owned by the window is hidden.
   *
   * @param targetWindow Window to query.
   * @returns True when the tab or window is not visible.
   */
  private documentIsHidden(targetWindow: Window): boolean {
    return targetWindow.document?.hidden === true;
  }
}
