import { Theme } from '../theme.js';
import { hexToRgb } from '../utils/color_utils.js';

/** Options for a blocking Yes/No confirmation dialog. */
export interface ConfirmDialogOptions {
  /** Parent element that owns the modal overlay. */
  host: HTMLElement;
  /** Dialog title shown in the header. */
  title: string;
  /** Body message explaining the consequence of confirming. */
  message: string;
  /** Affirmative button label. Defaults to "Yes". */
  confirmLabel?: string;
  /** Dismiss button label. Defaults to "No". */
  cancelLabel?: string;
}

/**
 * Shows a professional modal confirmation dialog and resolves when the user
 * chooses Yes or No. Escape and backdrop click dismiss as No.
 *
 * @param options Dialog title, message, labels, and host element.
 * @returns Promise resolving true when Yes is chosen.
 */
export function showConfirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const controller = new ConfirmDialogController(options, resolve);
    controller.open();
  });
}

/**
 * Internal modal lifecycle for one confirmation prompt. Disposes itself after
 * the first user decision.
 */
class ConfirmDialogController {
  private readonly options: ConfirmDialogOptions;
  private readonly resolve: (confirmed: boolean) => void;
  private readonly backdrop: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly boundKeyDown: (event: KeyboardEvent) => void;
  private settled: boolean;

  /**
   * @param options Dialog configuration.
   * @param resolve Promise settle callback.
   */
  constructor(options: ConfirmDialogOptions, resolve: (confirmed: boolean) => void) {
    this.options = options;
    this.resolve = resolve;
    this.settled = false;
    this.boundKeyDown = (event) => this.handleKeyDown(event);
    this.backdrop = this.createBackdrop();
    this.panel = this.createPanel();
    this.backdrop.appendChild(this.panel);
  }

  /** Appends the dialog and focuses the cancel button by default. */
  open(): void {
    this.options.host.appendChild(this.backdrop);
    document.addEventListener('keydown', this.boundKeyDown);
    const cancelButton = this.panel.querySelector<HTMLButtonElement>('[data-confirm-cancel="true"]');
    cancelButton?.focus();
  }

  /**
   * Handles Escape as cancel and Enter as confirm when focus is not a button.
   *
   * @param event Document keydown event.
   */
  private handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.settle(false);
      return;
    }
    if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault();
      this.settle(true);
    }
  }

  /**
   * Settles the promise once and removes the dialog from the DOM.
   *
   * @param confirmed True when the user chose Yes.
   */
  private settle(confirmed: boolean): void {
    if (this.settled) return;
    this.settled = true;
    document.removeEventListener('keydown', this.boundKeyDown);
    this.backdrop.remove();
    this.resolve(confirmed);
  }

  /**
   * Creates the full-screen dimmed backdrop.
   *
   * @returns Backdrop element.
   */
  private createBackdrop(): HTMLElement {
    const backdrop = document.createElement('div');
    backdrop.className = 'editor-confirm-dialog-backdrop';
    backdrop.style.position = 'fixed';
    backdrop.style.inset = '0';
    backdrop.style.display = 'flex';
    backdrop.style.alignItems = 'center';
    backdrop.style.justifyContent = 'center';
    backdrop.style.background = 'rgba(0, 0, 0, 0.55)';
    backdrop.style.zIndex = '20000';
    backdrop.style.fontFamily = Theme.uiFontFamily;
    backdrop.addEventListener('mousedown', (event) => {
      if (event.target === backdrop) this.settle(false);
    });
    return backdrop;
  }

  /**
   * Creates the centered dialog panel with title, message, and buttons.
   *
   * @returns Panel element.
   */
  private createPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'editor-confirm-dialog-panel';
    panel.setAttribute('role', 'alertdialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'editor-confirm-dialog-title');
    this.applyPanelChrome(panel);
    panel.appendChild(this.createTitle());
    panel.appendChild(this.createMessage());
    panel.appendChild(this.createButtonRow());
    panel.addEventListener('mousedown', (event) => event.stopPropagation());
    return panel;
  }

  /**
   * Applies Blender-inspired dark chrome to the dialog panel.
   *
   * @param panel Panel element.
   */
  private applyPanelChrome(panel: HTMLElement): void {
    panel.style.minWidth = '360px';
    panel.style.maxWidth = '440px';
    panel.style.padding = '18px 20px 16px';
    panel.style.borderRadius = '10px';
    panel.style.background = `linear-gradient(180deg, ${hexToRgb(Theme.toolbarBackground)} 0%, ${hexToRgb(Theme.toolbarBackgroundEnd)} 100%)`;
    panel.style.border = '1px solid rgba(255,255,255,0.1)';
    panel.style.boxShadow = '0 18px 48px rgba(0,0,0,0.65)';
    panel.style.color = Theme.buttonTextColor;
    panel.style.boxSizing = 'border-box';
  }

  /**
   * Creates the dialog title heading.
   *
   * @returns Title element.
   */
  private createTitle(): HTMLElement {
    const title = document.createElement('h2');
    title.id = 'editor-confirm-dialog-title';
    title.textContent = this.options.title;
    title.style.margin = '0 0 10px';
    title.style.fontSize = '15px';
    title.style.fontWeight = '600';
    title.style.letterSpacing = '0.01em';
    title.style.color = '#f0f0f0';
    return title;
  }

  /**
   * Creates the explanatory message body.
   *
   * @returns Message element.
   */
  private createMessage(): HTMLElement {
    const message = document.createElement('p');
    message.textContent = this.options.message;
    message.style.margin = '0 0 18px';
    message.style.fontSize = '13px';
    message.style.lineHeight = '1.45';
    message.style.color = '#c8c8c8';
    message.style.whiteSpace = 'pre-wrap';
    return message;
  }

  /**
   * Creates the Yes/No button row aligned to the right.
   *
   * @returns Button row container.
   */
  private createButtonRow(): HTMLElement {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'flex-end';
    row.style.gap = '8px';
    row.appendChild(this.createButton(this.options.cancelLabel ?? 'No', false, true));
    row.appendChild(this.createButton(this.options.confirmLabel ?? 'Yes', true, false));
    return row;
  }

  /**
   * Creates one dialog action button.
   *
   * @param label Button text.
   * @param isConfirm Whether the button accepts the prompt.
   * @param isCancel Whether the button is the default cancel focus target.
   * @returns Styled button element.
   */
  private createButton(label: string, isConfirm: boolean, isCancel: boolean): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    if (isCancel) button.dataset['confirmCancel'] = 'true';
    if (isConfirm) button.dataset['confirmAccept'] = 'true';
    this.styleActionButton(button, isConfirm);
    button.addEventListener('click', () => this.settle(isConfirm));
    return button;
  }

  /**
   * Applies compact chrome to a dialog button.
   *
   * @param button Button element.
   * @param isPrimary Whether the button is the affirmative action.
   */
  private styleActionButton(button: HTMLButtonElement, isPrimary: boolean): void {
    button.style.minWidth = '72px';
    button.style.padding = '7px 14px';
    button.style.borderRadius = '6px';
    button.style.border = isPrimary
      ? `1px solid ${hexToRgb(Theme.selectionColor)}`
      : '1px solid rgba(255,255,255,0.12)';
    button.style.background = isPrimary ? 'rgba(232, 106, 23, 0.28)' : 'rgba(255,255,255,0.06)';
    button.style.color = '#f2f2f2';
    button.style.cursor = 'pointer';
    button.style.fontFamily = Theme.uiFontFamily;
    button.style.fontSize = '12px';
    button.style.fontWeight = '600';
  }
}
