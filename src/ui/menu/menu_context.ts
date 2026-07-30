import { PanelMenu } from './panel_menu.js';
import type { ToolbarMenuEntry } from './menu_types.js';

/**
 * A single item in a context menu. Prefer {@link kind} `'separator'` for section
 * breaks so the shared menu system can render its styled rule.
 */
export type MenuContextItem =
  | {
      /** Clickable row (default when kind is omitted). */
      kind?: 'action';
      /** The display label for the menu item. */
      label: string;
      /** The callback function invoked when the item is clicked. */
      callback: () => void;
      /** Whether the item should be disabled and non-interactive. */
      disabled?: boolean;
    }
  | {
      /** Horizontal separator between sections. */
      kind: 'separator';
    };

/**
 * Floating context menu built on the shared {@link MenuPanel} system used by
 * File / Edit toolbar menus (same chrome, separators, hover, and stacking).
 * Auto-hides after selection, outside click, or Escape.
 */
export class MenuContext {
  private panel: PanelMenu;
  private isVisible: boolean;
  private outsideClickListener: (event: MouseEvent) => void;
  private keydownListener: (event: KeyboardEvent) => void;
  private ownerDocument: Document;

  /**
   * Creates a new context menu component.
   *
   * @param _container Legacy host argument retained for call-site
   *   compatibility. The panel mounts on document.body when shown (same as
   *   toolbar menus).
   * @param items The menu items to display.
   */
  constructor(_container: HTMLElement, items: MenuContextItem[]) {
    void _container;
    this.isVisible = false;
    this.ownerDocument = document;
    this.panel = new PanelMenu(this.toMenuEntries(items), () => this.hide());
    this.outsideClickListener = (event: MouseEvent) => this.onOutsideClick(event);
    this.keydownListener = (event: KeyboardEvent) => this.onKeyDown(event);
  }

  /**
   * Returns the menu panel root element (for tests and focus management).
   *
   * @returns Menu panel DOM node.
   */
  getElement(): HTMLElement {
    return this.panel.getElement();
  }

  /**
   * Shows the menu at the specified screen coordinates.
   *
   * @param x The horizontal screen position.
   * @param y The vertical screen position.
   */
  show(x: number, y: number): void {
    if (this.isVisible) return;
    this.isVisible = true;
    this.ownerDocument = document;
    this.panel.openAt(x, y, this.ownerDocument);
    this.ownerDocument.addEventListener('mousedown', this.outsideClickListener, true);
    this.ownerDocument.addEventListener('keydown', this.keydownListener, true);
  }

  /** Hides the menu and removes global event listeners. */
  hide(): void {
    if (!this.isVisible) return;
    this.isVisible = false;
    this.panel.close();
    this.ownerDocument.removeEventListener('mousedown', this.outsideClickListener, true);
    this.ownerDocument.removeEventListener('keydown', this.keydownListener, true);
  }

  /** Disposes the menu and removes it from the DOM. */
  dispose(): void {
    this.hide();
    this.panel.dispose();
  }

  /**
   * Maps legacy/context item definitions onto toolbar menu entries.
   *
   * @param items Context menu items.
   * @returns Entries for {@link MenuPanel}.
   */
  private toMenuEntries(items: MenuContextItem[]): ToolbarMenuEntry[] {
    return items.map((item) => this.toMenuEntry(item));
  }

  /**
   * Maps one context item to a toolbar menu entry. Legacy separators used a
   * `'---'` label; prefer `kind: 'separator'`.
   *
   * @param item Context menu item.
   * @returns Toolbar menu entry.
   */
  private toMenuEntry(item: MenuContextItem): ToolbarMenuEntry {
    if (item.kind === 'separator') {
      return { kind: 'separator' };
    }
    if (item.label === '---') {
      return { kind: 'separator' };
    }
    const disabled = item.disabled === true;
    if (disabled) {
      return {
        kind: 'action',
        label: item.label,
        onClick: item.callback,
        isEnabled: () => false,
      };
    }
    return {
      kind: 'action',
      label: item.label,
      onClick: item.callback,
    };
  }

  /**
   * Handles mouse clicks outside the menu area.
   *
   * @param event The mouse event to inspect.
   */
  private onOutsideClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Node)) {
      this.hide();
      return;
    }
    if (this.panel.getElement().contains(target)) return;
    this.hide();
  }

  /**
   * Handles keyboard events to detect Escape key presses.
   *
   * @param event The keyboard event to inspect.
   */
  private onKeyDown(event: KeyboardEvent): void {
    if (event.code === 'Escape') {
      event.preventDefault();
      this.hide();
    }
  }
}
