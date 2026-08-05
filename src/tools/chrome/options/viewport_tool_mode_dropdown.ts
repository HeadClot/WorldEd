import { Theme } from '@/theme.js';
import { PanelMenu } from '@/ui/menu/panel_menu.js';
import { EditorInteractionMode, getEditorInteractionModeLabel } from '@/types/editor_interaction_mode.js';
import { applyViewportToolOptionsTextButtonMetrics } from './viewport_tool_options_control_style.js';
import { buildViewportToolModeMenuEntries } from './viewport_tool_mode_menu.js';

/**
 * Blender-style Object Mode / Edit Mode control using the shared editor menu
 * system (PanelMenu) so the panel stacks above the floating tool rail.
 */
export class ViewportToolModeDropdown {
  private readonly ownerDocument: Document;
  private readonly ownerWindow: Window;
  private readonly wrapper: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly label: HTMLElement;
  private readonly onModeSelected: (mode: EditorInteractionMode) => void;
  private activeMode: EditorInteractionMode;
  private menuPanel: PanelMenu | null;
  private documentClickCloser: ((event: PointerEvent) => void) | null;

  /**
   * Creates the mode dropdown.
   *
   * @param parentElement Options bar host.
   * @param onModeSelected Invoked when the user picks a mode.
   */
  constructor(parentElement: HTMLElement, onModeSelected: (mode: EditorInteractionMode) => void) {
    this.ownerDocument = parentElement.ownerDocument;
    this.ownerWindow = parentElement.ownerDocument.defaultView ?? window;
    this.onModeSelected = onModeSelected;
    this.activeMode = EditorInteractionMode.OBJECT_MODE;
    this.menuPanel = null;
    this.documentClickCloser = null;
    this.wrapper = this.ownerDocument.createElement('div');
    this.button = this.ownerDocument.createElement('button');
    this.label = this.ownerDocument.createElement('span');
    this.buildChrome();
    parentElement.appendChild(this.wrapper);
    this.setActiveMode(EditorInteractionMode.OBJECT_MODE);
  }

  /**
   * Updates the displayed active mode.
   *
   * @param mode Interaction mode.
   */
  setActiveMode(mode: EditorInteractionMode): void {
    this.activeMode = mode;
    this.label.textContent = getEditorInteractionModeLabel(mode);
    this.button.title = `${getEditorInteractionModeLabel(mode)} (Tab)`;
  }

  /**
   * Returns the wrapper element for layout.
   *
   * @returns Wrapper element.
   */
  getElement(): HTMLElement {
    return this.wrapper;
  }

  /**
   * Returns the open menu panel when present.
   *
   * @returns PanelMenu instance, or null.
   */
  getMenuPanel(): PanelMenu | null {
    return this.menuPanel;
  }

  /** Closes the menu and removes listeners. */
  dispose(): void {
    this.closeMenu();
    this.menuPanel?.dispose();
    this.menuPanel = null;
    this.wrapper.remove();
  }

  /** Builds the trigger button and attaches the menu host. */
  private buildChrome(): void {
    this.wrapper.style.position = 'relative';
    this.wrapper.style.display = 'inline-flex';
    this.wrapper.style.alignItems = 'center';
    this.button.type = 'button';
    this.button.setAttribute('aria-haspopup', 'menu');
    this.button.setAttribute('aria-expanded', 'false');
    this.styleButton();
    this.styleLabel();
    this.button.appendChild(this.label);
    this.appendCaret(this.button);
    this.button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.toggleMenu();
    });
    this.wrapper.appendChild(this.button);
    this.rebuildMenuPanel();
  }

  /** Styles the closed mode button to match other options-bar controls. */
  private styleButton(): void {
    applyViewportToolOptionsTextButtonMetrics(this.button);
    this.button.style.gap = '3px';
    this.button.style.fontWeight = '600';
  }

  /** Styles the active-mode label text. */
  private styleLabel(): void {
    this.label.style.fontFamily = Theme.uiFontFamily;
    this.label.style.fontSize = '11px';
    this.label.style.fontWeight = '600';
    this.label.style.lineHeight = '1';
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

  /** Opens or closes the mode menu. */
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

  /** Rebuilds menu entries so the active checkmark stays current. */
  private rebuildMenuPanel(): void {
    this.menuPanel?.dispose();
    this.menuPanel = new PanelMenu(
      buildViewportToolModeMenuEntries(this.activeMode, (mode) => this.handleModeChosen(mode)),
      () => this.closeMenu(),
    );
    this.wrapper.appendChild(this.menuPanel.getElement());
  }

  /**
   * Applies a mode choice from the menu and closes the panel.
   *
   * @param mode Chosen interaction mode.
   */
  private handleModeChosen(mode: EditorInteractionMode): void {
    this.closeMenu();
    this.onModeSelected(mode);
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
