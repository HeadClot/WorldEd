import { Theme } from '@/theme.js';
import { PanelMenu } from '@/ui/menu/panel_menu.js';
import { ObjectApplyTransformKind } from '@/types/object_apply_transform_kind.js';
import { applyViewportToolOptionsTextButtonMetrics } from './viewport_tool_options_control_style.js';
import { buildViewportToolObjectMenuEntries } from './viewport_tool_object_menu.js';

/** Object menu control for the Edit Mode options bar (Object → Apply → …). */
export class ViewportToolObjectDropdown {
  private readonly ownerDocument: Document;
  private readonly ownerWindow: Window;
  private readonly wrapper: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly onApply: (kind: ObjectApplyTransformKind) => void;
  private menuPanel: PanelMenu | null;
  private documentClickCloser: ((event: PointerEvent) => void) | null;

  /**
   * Creates the Object dropdown.
   *
   * @param parentElement Options bar host (not used as mount; parent attaches
   *   getElement()).
   * @param onApply Invoked for Apply submenu actions.
   */
  constructor(parentElement: HTMLElement, onApply: (kind: ObjectApplyTransformKind) => void) {
    this.ownerDocument = parentElement.ownerDocument;
    this.ownerWindow = parentElement.ownerDocument.defaultView ?? window;
    this.onApply = onApply;
    this.menuPanel = null;
    this.documentClickCloser = null;
    this.wrapper = this.ownerDocument.createElement('div');
    this.button = this.ownerDocument.createElement('button');
    this.buildChrome();
  }

  /**
   * Returns the wrapper element for layout.
   *
   * @returns Wrapper element.
   */
  getElement(): HTMLElement {
    return this.wrapper;
  }

  /** Closes the menu and removes listeners. */
  dispose(): void {
    this.closeMenu();
    this.menuPanel?.dispose();
    this.menuPanel = null;
    this.wrapper.remove();
  }

  /** Builds the Object trigger button. */
  private buildChrome(): void {
    this.wrapper.style.position = 'relative';
    this.wrapper.style.display = 'inline-flex';
    this.wrapper.style.alignItems = 'center';
    this.button.type = 'button';
    this.button.setAttribute('aria-haspopup', 'menu');
    this.button.setAttribute('aria-expanded', 'false');
    this.button.setAttribute('aria-label', 'Object');
    this.styleButton();
    this.button.textContent = 'Object';
    this.appendCaret(this.button);
    this.button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.toggleMenu();
    });
    this.wrapper.appendChild(this.button);
    this.rebuildMenuPanel();
  }

  /** Styles the Object trigger like other options-bar text controls. */
  private styleButton(): void {
    applyViewportToolOptionsTextButtonMetrics(this.button);
    this.button.style.gap = '3px';
    this.button.style.fontWeight = '600';
    this.button.style.fontFamily = Theme.uiFontFamily;
    this.button.style.fontSize = '11px';
  }

  /**
   * Appends a dropdown caret.
   *
   * @param button Button receiving the caret.
   */
  private appendCaret(button: HTMLButtonElement): void {
    const caret = this.ownerDocument.createElement('span');
    caret.textContent = '▾';
    caret.style.fontSize = '9px';
    caret.style.opacity = '0.7';
    button.appendChild(caret);
  }

  /** Opens or closes the Object menu. */
  private toggleMenu(): void {
    if (this.menuPanel?.isOpen()) {
      this.closeMenu();
      return;
    }
    this.openMenu();
  }

  /** Shows the shared menu panel under the trigger. */
  private openMenu(): void {
    this.rebuildMenuPanel();
    if (!this.menuPanel) {
      return;
    }
    this.menuPanel.open(this.button);
    this.button.setAttribute('aria-expanded', 'true');
    this.documentClickCloser = (event) => this.handleOutsidePointerDown(event);
    this.ownerWindow.addEventListener('pointerdown', this.documentClickCloser, true);
  }

  /** Hides the menu and removes outside-press listeners. */
  private closeMenu(): void {
    this.menuPanel?.close();
    this.button.setAttribute('aria-expanded', 'false');
    if (this.documentClickCloser) {
      this.ownerWindow.removeEventListener('pointerdown', this.documentClickCloser, true);
      this.documentClickCloser = null;
    }
  }

  /** Rebuilds menu entries so Apply actions stay current. */
  private rebuildMenuPanel(): void {
    this.menuPanel?.dispose();
    this.menuPanel = new PanelMenu(
      buildViewportToolObjectMenuEntries((kind) => this.handleApplyChosen(kind)),
      () => this.closeMenu(),
    );
    this.wrapper.appendChild(this.menuPanel.getElement());
  }

  /**
   * Runs an apply action and closes the menu.
   *
   * @param kind Chosen apply kind.
   */
  private handleApplyChosen(kind: ObjectApplyTransformKind): void {
    this.closeMenu();
    this.onApply(kind);
  }

  /**
   * Closes the menu when the pointer presses outside the control and panel.
   *
   * @param event Capture-phase pointer event.
   */
  private handleOutsidePointerDown(event: PointerEvent): void {
    const target = event.target as Node | null;
    if (!target) {
      return;
    }
    if (this.wrapper.contains(target)) {
      return;
    }
    if (this.menuPanel?.getElement().contains(target)) {
      return;
    }
    this.closeMenu();
  }
}
