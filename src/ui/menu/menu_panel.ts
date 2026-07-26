import {
  isMenuAction,
  isMenuSeparator,
  isMenuSubmenu,
  type ToolbarMenuAction,
  type ToolbarMenuEntry,
  type ToolbarMenuSubmenu,
} from './menu_types.js';
import {
  applyMenuItemEnabledState,
  applyMenuItemHoverState,
  styleMenuActionRow,
  styleMenuLabel,
  styleMenuPanel,
  styleMenuSeparator,
  styleMenuShortcut,
  styleMenuSubmenuCaret,
} from './menu_styles.js';

/** Bound action or submenu row with its live entry definition. */
interface BoundMenuRow {
  entry: ToolbarMenuAction | ToolbarMenuSubmenu;
  button: HTMLButtonElement;
  /** Wrapper used for submenu parents so the flyout is not inside the button. */
  rowHost: HTMLElement;
  shortcutElement: HTMLElement | null;
  submenuPanel: MenuPanel | null;
}

/**
 * Builds and manages one dropdown or flyout panel. Nested submenus open on
 * hover in a Windows-style cascade and close when sibling rows are entered.
 */
/** Delay before a submenu flyout closes after pointer leave (Windows-like). */
const SUBMENU_CLOSE_DELAY_MS = 200;

export class MenuPanel {
  private readonly root: HTMLElement;
  private readonly rows: BoundMenuRow[];
  private readonly onRequestCloseRoot: () => void;
  private openChildPanel: MenuPanel | null;
  private activeRowButton: HTMLButtonElement | null;
  private pendingCloseTimer: ReturnType<typeof setTimeout> | null;

  /**
   * Creates a menu panel from declarative entries.
   *
   * @param entries Menu rows to render.
   * @param onRequestCloseRoot Closes the entire toolbar dropdown tree.
   * @param isSubmenu Whether this panel is a nested flyout.
   */
  constructor(entries: ToolbarMenuEntry[], onRequestCloseRoot: () => void, isSubmenu = false) {
    this.rows = [];
    this.openChildPanel = null;
    this.activeRowButton = null;
    this.pendingCloseTimer = null;
    this.onRequestCloseRoot = onRequestCloseRoot;
    this.root = document.createElement('div');
    this.root.classList.add(isSubmenu ? 'editor-toolbar-dropdown-submenu' : 'editor-toolbar-dropdown-menu');
    this.root.setAttribute('role', 'menu');
    styleMenuPanel(this.root, isSubmenu);
    entries.forEach((entry) => this.appendEntry(entry));
  }

  /**
   * Returns the panel root element.
   *
   * @returns Menu panel DOM node.
   */
  getElement(): HTMLElement {
    return this.root;
  }

  /** Shows the panel and refreshes live enablement and shortcut labels. */
  open(): void {
    this.refresh();
    this.root.style.display = 'block';
  }

  /** Hides the panel and any open child flyout. */
  close(): void {
    this.cancelPendingClose();
    this.closeOpenChild();
    this.setActiveRow(null);
    this.root.style.display = 'none';
  }

  /**
   * Returns whether the panel is currently visible.
   *
   * @returns True when display is not none.
   */
  isOpen(): boolean {
    return this.root.style.display !== 'none';
  }

  /** Re-evaluates enablement and shortcut labels for every bound row. */
  refresh(): void {
    this.rows.forEach((row) => this.refreshRow(row));
    this.syncActiveRowHighlight();
  }

  /**
   * Appends one declarative entry to the panel.
   *
   * @param entry Entry to render.
   */
  private appendEntry(entry: ToolbarMenuEntry): void {
    if (isMenuSeparator(entry)) {
      this.root.appendChild(this.createSeparatorElement());
      return;
    }
    if (isMenuSubmenu(entry)) {
      this.root.appendChild(this.createSubmenuRow(entry));
      return;
    }
    if (isMenuAction(entry)) {
      this.root.appendChild(this.createActionRow(entry));
    }
  }

  /**
   * Creates a horizontal separator element.
   *
   * @returns Separator DOM node.
   */
  private createSeparatorElement(): HTMLElement {
    const separator = document.createElement('div');
    styleMenuSeparator(separator);
    return separator;
  }

  /**
   * Creates a clickable action row with optional shortcut text.
   *
   * @param entry Action definition.
   * @returns Row button element.
   */
  private createActionRow(entry: ToolbarMenuAction): HTMLButtonElement {
    const button = this.createBaseRowButton(entry.label);
    const shortcutElement = this.appendShortcutSlot(button);
    this.bindActionActivation(button, entry);
    this.bindActionRowHover(button);
    this.rows.push({
      entry,
      button,
      rowHost: button,
      shortcutElement,
      submenuPanel: null,
    });
    return button;
  }

  /**
   * Creates a parent row that opens a nested flyout on hover. The flyout is a
   * sibling of the button so opening it cannot steal hover from the parent.
   *
   * @param entry Submenu definition.
   * @returns Wrapper element containing the button and flyout.
   */
  private createSubmenuRow(entry: ToolbarMenuSubmenu): HTMLElement {
    const host = document.createElement('div');
    host.classList.add('editor-toolbar-dropdown-submenu-host');
    host.style.position = 'relative';
    host.style.width = '100%';
    const button = this.createBaseRowButton(entry.label);
    button.classList.add('editor-toolbar-dropdown-item-has-submenu');
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    this.appendSubmenuCaret(button);
    const submenuPanel = new MenuPanel(entry.children, this.onRequestCloseRoot, true);
    host.appendChild(button);
    host.appendChild(submenuPanel.getElement());
    this.bindSubmenuRowHover(host, button, submenuPanel);
    this.rows.push({
      entry,
      button,
      rowHost: host,
      shortcutElement: null,
      submenuPanel,
    });
    return host;
  }

  /**
   * Creates the shared button chrome for action and submenu rows.
   *
   * @param label Visible left-side label text.
   * @returns Styled button with label span.
   */
  private createBaseRowButton(label: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.classList.add('editor-toolbar-dropdown-item');
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    styleMenuActionRow(button);
    const labelElement = document.createElement('span');
    labelElement.classList.add('editor-toolbar-dropdown-label');
    labelElement.textContent = label;
    styleMenuLabel(labelElement);
    button.appendChild(labelElement);
    return button;
  }

  /**
   * Appends an empty shortcut slot that refresh fills later.
   *
   * @param button Parent row button.
   * @returns Shortcut element.
   */
  private appendShortcutSlot(button: HTMLButtonElement): HTMLElement {
    const shortcut = document.createElement('span');
    styleMenuShortcut(shortcut);
    shortcut.style.display = 'none';
    button.appendChild(shortcut);
    return shortcut;
  }

  /**
   * Appends a disclosure caret for submenu parents.
   *
   * @param button Parent row button.
   */
  private appendSubmenuCaret(button: HTMLButtonElement): void {
    const caret = document.createElement('span');
    caret.textContent = '▸';
    caret.setAttribute('aria-hidden', 'true');
    styleMenuSubmenuCaret(caret);
    button.appendChild(caret);
  }

  /**
   * Binds click activation for an action row.
   *
   * @param button Row button.
   * @param entry Action definition.
   */
  private bindActionActivation(button: HTMLButtonElement, entry: ToolbarMenuAction): void {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      if (button.disabled) return;
      entry.onClick();
      this.onRequestCloseRoot();
    });
  }

  /**
   * Binds hover highlight for a plain action row.
   *
   * @param button Action row button.
   */
  private bindActionRowHover(button: HTMLButtonElement): void {
    button.addEventListener('mouseenter', () => {
      this.setActiveRow(button);
      this.closeOpenChild();
    });
    button.addEventListener('mouseleave', (event) => {
      if (this.shouldKeepActiveRow(button, event.relatedTarget)) return;
      if (this.activeRowButton === button) this.setActiveRow(null);
    });
  }

  /**
   * Binds hover open/close for a submenu parent and keeps its highlight while
   * the pointer is over the parent or its open flyout.
   *
   * @param host Wrapper that contains the button and flyout.
   * @param button Parent row button.
   * @param submenuPanel Nested flyout panel.
   */
  private bindSubmenuRowHover(host: HTMLElement, button: HTMLButtonElement, submenuPanel: MenuPanel): void {
    const flyout = submenuPanel.getElement();
    const keepOpen = (): void => {
      this.cancelPendingClose();
      this.setActiveRow(button);
      if (!button.disabled) this.openChild(submenuPanel, button);
    };
    host.addEventListener('mouseenter', keepOpen);
    flyout.addEventListener('mouseenter', keepOpen);
    host.addEventListener('mouseleave', (event) => {
      if (this.isPointerStillInSubmenuRow(host, flyout, event.relatedTarget)) return;
      this.scheduleCloseChild(submenuPanel, button);
    });
    flyout.addEventListener('mouseleave', (event) => {
      if (this.isPointerStillInSubmenuRow(host, flyout, event.relatedTarget)) return;
      this.scheduleCloseChild(submenuPanel, button);
    });
  }

  /**
   * Schedules closing a flyout after a short delay so diagonal pointer travel
   * into the flyout does not collapse it immediately.
   *
   * @param submenuPanel Flyout that may close.
   * @param button Parent row button for that flyout.
   */
  private scheduleCloseChild(submenuPanel: MenuPanel, button: HTMLButtonElement): void {
    this.cancelPendingClose();
    this.pendingCloseTimer = setTimeout(() => {
      this.pendingCloseTimer = null;
      if (this.openChildPanel !== submenuPanel) return;
      this.closeOpenChild();
      if (this.activeRowButton === button) this.setActiveRow(null);
    }, SUBMENU_CLOSE_DELAY_MS);
  }

  /** Cancels any pending delayed flyout close. */
  private cancelPendingClose(): void {
    if (this.pendingCloseTimer === null) return;
    clearTimeout(this.pendingCloseTimer);
    this.pendingCloseTimer = null;
  }

  /**
   * Returns whether the pointer is still inside an action row host.
   *
   * @param host Row host currently being left.
   * @param relatedTarget Element the pointer moved toward, if any.
   * @returns True when the active highlight should remain.
   */
  private shouldKeepActiveRow(host: HTMLElement, relatedTarget: EventTarget | null): boolean {
    if (!(relatedTarget instanceof Node)) return false;
    return host.contains(relatedTarget);
  }

  /**
   * Returns whether the pointer is still over a submenu parent or its flyout.
   *
   * @param host Submenu row host.
   * @param flyout Nested flyout panel element.
   * @param relatedTarget Element the pointer moved toward, if any.
   * @returns True when the submenu should stay open.
   */
  private isPointerStillInSubmenuRow(
    host: HTMLElement,
    flyout: HTMLElement,
    relatedTarget: EventTarget | null,
  ): boolean {
    if (!(relatedTarget instanceof Node)) return false;
    return host.contains(relatedTarget) || flyout.contains(relatedTarget);
  }

  /**
   * Opens a child flyout after closing any other open child. Marks the parent
   * active before DOM changes so highlight is never dropped mid-open.
   *
   * @param panel Child panel to open.
   * @param parentButton Parent row that owns the panel.
   */
  private openChild(panel: MenuPanel, parentButton: HTMLButtonElement): void {
    this.cancelPendingClose();
    if (this.openChildPanel === panel) {
      this.setActiveRow(parentButton);
      return;
    }
    this.closeOpenChild();
    this.openChildPanel = panel;
    this.setActiveRow(parentButton);
    parentButton.setAttribute('aria-expanded', 'true');
    panel.open();
  }

  /** Closes the currently open child flyout if any. */
  private closeOpenChild(): void {
    this.cancelPendingClose();
    if (!this.openChildPanel) return;
    const closing = this.openChildPanel;
    this.openChildPanel = null;
    closing.close();
    this.rows.forEach((row) => {
      if (row.submenuPanel) row.button.setAttribute('aria-expanded', 'false');
    });
  }

  /**
   * Sets which row shows the hover/active background. Exactly one row may be
   * active at a time within this panel.
   *
   * @param button Row button to highlight, or null to clear all.
   */
  private setActiveRow(button: HTMLButtonElement | null): void {
    this.activeRowButton = button;
    this.syncActiveRowHighlight();
  }

  /** Applies active/hover background from the current active row pointer. */
  private syncActiveRowHighlight(): void {
    this.rows.forEach((row) => {
      applyMenuItemHoverState(row.button, row.button === this.activeRowButton);
    });
  }

  /**
   * Refreshes enablement and shortcut text for one bound row.
   *
   * @param row Bound row state.
   */
  private refreshRow(row: BoundMenuRow): void {
    const enabled = row.entry.isEnabled ? row.entry.isEnabled() : true;
    applyMenuItemEnabledState(row.button, enabled);
    if (isMenuAction(row.entry) && row.shortcutElement) {
      this.refreshShortcutLabel(row.shortcutElement, row.entry);
    }
    row.submenuPanel?.refresh();
  }

  /**
   * Resolves and displays the shortcut label for an action row.
   *
   * @param shortcutElement Shortcut span.
   * @param entry Action definition.
   */
  private refreshShortcutLabel(shortcutElement: HTMLElement, entry: ToolbarMenuAction): void {
    const text = this.resolveShortcutText(entry);
    if (!text) {
      shortcutElement.textContent = '';
      shortcutElement.style.display = 'none';
      return;
    }
    shortcutElement.textContent = text;
    shortcutElement.style.display = '';
  }

  /**
   * Resolves the live or static shortcut string for an action.
   *
   * @param entry Action definition.
   * @returns Shortcut text, or empty when none.
   */
  private resolveShortcutText(entry: ToolbarMenuAction): string {
    if (!entry.shortcut) return '';
    if (typeof entry.shortcut === 'function') {
      return entry.shortcut()?.trim() ?? '';
    }
    return entry.shortcut.trim();
  }
}
