import { UiStackLayers } from '@/ui/stack/ui_stack_layers.js';

/**
 * Window manager for floating editor tool panels. Maintains a last-focused
 * stacking order with z-indices always below menus so dropdowns and context
 * menus never draw underneath Tools / UV / Texture windows.
 */
export class FloatingPanelStack {
  private static readonly registeredPanels: HTMLElement[] = [];
  private static readonly clampHandlers = new Map<HTMLElement, () => void>();
  private static windowResizeBound = false;

  /**
   * Registers a floating panel for stacking and optional resize clamping.
   *
   * @param panel Panel root element.
   * @param onWindowResize Optional callback when the browser window resizes.
   */
  static register(panel: HTMLElement, onWindowResize?: () => void): void {
    if (this.registeredPanels.includes(panel)) return;
    this.registeredPanels.push(panel);
    if (onWindowResize) {
      this.clampHandlers.set(panel, onWindowResize);
    }
    this.ensureWindowResizeListener();
    this.reassignZIndices();
  }

  /**
   * Unregisters a panel when it is disposed.
   *
   * @param panel Panel root element.
   */
  static unregister(panel: HTMLElement): void {
    const index = this.registeredPanels.indexOf(panel);
    if (index >= 0) {
      this.registeredPanels.splice(index, 1);
    }
    this.clampHandlers.delete(panel);
    this.reassignZIndices();
  }

  /**
   * Moves a panel to the top of the floating stack (last one clicked is front).
   * Menus stay above the floating ceiling defined in {@link UiStackLayers}.
   *
   * @param panel Root element of the floating panel.
   */
  static bringToFront(panel: HTMLElement): void {
    const index = this.registeredPanels.indexOf(panel);
    if (index >= 0) {
      this.registeredPanels.splice(index, 1);
    }
    this.registeredPanels.push(panel);
    this.reassignZIndices();
  }

  /** Resets registry state (for tests). */
  static resetForTests(): void {
    this.registeredPanels.length = 0;
    this.clampHandlers.clear();
  }

  /**
   * Returns how many panels are currently registered (tests).
   *
   * @returns Registered panel count.
   */
  static getRegisteredCount(): number {
    return this.registeredPanels.length;
  }

  /**
   * Returns the current top z-index value among floating panels (tests).
   *
   * @returns Last assigned floating z-index, or base when empty.
   */
  static getCurrentTopZIndex(): number {
    if (this.registeredPanels.length === 0) {
      return UiStackLayers.floatingPanelBase;
    }
    return UiStackLayers.floatingPanelBase + this.registeredPanels.length - 1;
  }

  /** Reassigns sequential z-indices in registration focus order. */
  private static reassignZIndices(): void {
    const base = UiStackLayers.floatingPanelBase;
    const ceiling = UiStackLayers.floatingPanelCeiling;
    for (let i = 0; i < this.registeredPanels.length; i++) {
      const panel = this.registeredPanels[i]!;
      const zIndex = Math.min(ceiling, base + i);
      panel.style.zIndex = String(zIndex);
    }
  }

  /** Installs a single window resize listener for all registered clamps. */
  private static ensureWindowResizeListener(): void {
    if (this.windowResizeBound || typeof window === 'undefined') return;
    this.windowResizeBound = true;
    window.addEventListener('resize', () => {
      this.clampHandlers.forEach((handler) => handler());
    });
  }
}
