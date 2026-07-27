import { UiStackLayers } from './ui_stack_layers.js';

/**
 * Shared stacking order for floating editor panels. Each bring-to-front call
 * increments a counter so the focused panel draws above peers, but never above
 * the menu band (dropdowns / context menus always win).
 */
export class FloatingPanelStack {
  /**
   * Next z-index to assign; kept as number so base/ceiling literals can both
   * assign.
   */
  private static nextZIndex: number = UiStackLayers.floatingPanelBase;

  /**
   * Assigns the next highest z-index so the panel appears above other floating
   * panels without covering menus.
   *
   * @param panel Root element of the floating panel.
   */
  static bringToFront(panel: HTMLElement): void {
    const ceiling = UiStackLayers.floatingPanelCeiling;
    const base = UiStackLayers.floatingPanelBase;
    if (FloatingPanelStack.nextZIndex >= ceiling) {
      FloatingPanelStack.nextZIndex = base;
    }
    FloatingPanelStack.nextZIndex += 1;
    if (FloatingPanelStack.nextZIndex > ceiling) {
      FloatingPanelStack.nextZIndex = ceiling;
    }
    panel.style.zIndex = String(FloatingPanelStack.nextZIndex);
  }

  /** Resets the stack counter (for tests). */
  static resetForTests(): void {
    FloatingPanelStack.nextZIndex = UiStackLayers.floatingPanelBase;
  }

  /**
   * Returns the current top z-index value without consuming a new one.
   *
   * @returns Last assigned z-index.
   */
  static getCurrentTopZIndex(): number {
    return FloatingPanelStack.nextZIndex;
  }
}
