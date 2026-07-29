import { Theme } from '../../theme.js';
import { hexToRgb } from '../../utils/color_utils.js';
import type { McpDesktopBridge } from './mcp_desktop_bridge.js';
import type { McpHostStatus } from '../shared/mcp_protocol_types.js';

/** Options for the MCP connection dialog. */
export interface McpDialogOptions {
  /** Parent element that owns the modal overlay. */
  host: HTMLElement;
  /** Desktop MCP bridge, or null outside Electrobun. */
  bridge: McpDesktopBridge | null;
  /** Status bar / toast callback. */
  showStatus: (message: string) => void;
  /** Called when host running state is known or changes (toolbar glow). */
  onRunningChanged?: (running: boolean) => void;
}

/**
 * Opens a modal dialog with MCP start/stop controls and simple connection
 * instructions (URL only).
 *
 * @param options Host, bridge, and status callback.
 * @returns Promise that resolves when the dialog is closed.
 */
export function showMcpDialog(options: McpDialogOptions): Promise<void> {
  return new Promise<void>((resolve) => {
    const controller = new McpDialogController(options, resolve);
    void controller.open();
  });
}

/**
 * Modal lifecycle for the MCP instructions dialog. Mirrors message-box chrome
 * and settles once when closed.
 */
class McpDialogController {
  private readonly options: McpDialogOptions;
  private readonly resolve: () => void;
  private readonly backdrop: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly statusLine: HTMLElement;
  private readonly urlField: HTMLInputElement;
  private readonly primaryButton: HTMLButtonElement;
  private readonly boundKeyDown: (event: KeyboardEvent) => void;
  private settled: boolean;
  private running: boolean;

  /**
   * @param options Dialog configuration.
   * @param resolve Close callback.
   */
  constructor(options: McpDialogOptions, resolve: () => void) {
    this.options = options;
    this.resolve = resolve;
    this.settled = false;
    this.running = false;
    this.boundKeyDown = (event) => this.handleKeyDown(event);
    this.statusLine = document.createElement('p');
    this.urlField = this.createReadonlyField('mcp-url');
    this.primaryButton = document.createElement('button');
    this.backdrop = this.createBackdrop();
    this.panel = this.createPanel();
    this.backdrop.appendChild(this.panel);
  }

  /** Appends the dialog and loads current MCP host status. */
  async open(): Promise<void> {
    this.options.host.appendChild(this.backdrop);
    document.addEventListener('keydown', this.boundKeyDown);
    await this.refreshStatus();
    this.primaryButton.focus();
  }

  /**
   * Handles Escape as close.
   *
   * @param event Document keydown event.
   */
  private handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  }

  /** Removes the dialog and settles the open promise. */
  private close(): void {
    if (this.settled) return;
    this.settled = true;
    document.removeEventListener('keydown', this.boundKeyDown);
    this.backdrop.remove();
    this.resolve();
  }

  /**
   * Creates the full-screen dimmed backdrop (message-box style).
   *
   * @returns Backdrop element.
   */
  private createBackdrop(): HTMLElement {
    const backdrop = document.createElement('div');
    backdrop.className = 'editor-message-box-backdrop';
    backdrop.style.position = 'fixed';
    backdrop.style.inset = '0';
    backdrop.style.display = 'flex';
    backdrop.style.alignItems = 'center';
    backdrop.style.justifyContent = 'center';
    backdrop.style.background = 'rgba(0, 0, 0, 0.55)';
    backdrop.style.zIndex = '20000';
    backdrop.style.fontFamily = Theme.uiFontFamily;
    backdrop.addEventListener('mousedown', (event) => {
      if (event.target === backdrop) this.close();
    });
    return backdrop;
  }

  /**
   * Creates the centered dialog panel.
   *
   * @returns Panel element.
   */
  private createPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'editor-message-box-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'editor-mcp-dialog-title');
    this.applyPanelChrome(panel);
    panel.appendChild(this.createTitle());
    panel.appendChild(this.createStatusLine());
    panel.appendChild(this.createInstructions());
    panel.appendChild(this.createFieldBlock('URL', this.urlField));
    panel.appendChild(this.createButtonRow());
    panel.addEventListener('mousedown', (event) => event.stopPropagation());
    return panel;
  }

  /**
   * Applies Blender-inspired dark chrome matching the message box.
   *
   * @param panel Panel element.
   */
  private applyPanelChrome(panel: HTMLElement): void {
    panel.style.minWidth = '420px';
    panel.style.maxWidth = '520px';
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
    title.id = 'editor-mcp-dialog-title';
    title.textContent = 'MCP Server';
    title.style.margin = '0 0 10px';
    title.style.fontSize = '15px';
    title.style.fontWeight = '600';
    title.style.letterSpacing = '0.01em';
    title.style.color = '#f0f0f0';
    return title;
  }

  /**
   * Creates the live status line under the title.
   *
   * @returns Status paragraph.
   */
  private createStatusLine(): HTMLElement {
    this.statusLine.style.margin = '0 0 12px';
    this.statusLine.style.fontSize = '13px';
    this.statusLine.style.lineHeight = '1.45';
    this.statusLine.style.color = '#c8c8c8';
    this.statusLine.textContent = 'Status: checking…';
    return this.statusLine;
  }

  /**
   * Creates the instruction paragraph for MCP clients.
   *
   * @returns Instructions block.
   */
  private createInstructions(): HTMLElement {
    const body = document.createElement('p');
    body.style.margin = '0 0 14px';
    body.style.fontSize = '13px';
    body.style.lineHeight = '1.45';
    body.style.color = '#c8c8c8';
    body.style.whiteSpace = 'pre-wrap';
    body.textContent = [
      'Lets AI tools (such as Grok Build) edit this map while the desktop app is open.',
      '',
      '1. Click Start server.',
      '2. Copy the URL below.',
      '3. Add that URL as an HTTP MCP server in your AI tool (no password or token).',
    ].join('\n');
    return body;
  }

  /**
   * Creates a labeled monospace field row.
   *
   * @param label Field label.
   * @param field Input element.
   * @returns Container element.
   */
  private createFieldBlock(label: string, field: HTMLInputElement): HTMLElement {
    const block = document.createElement('div');
    block.style.margin = '0 0 16px';
    const caption = document.createElement('div');
    caption.textContent = label;
    caption.style.fontSize = '11px';
    caption.style.fontWeight = '600';
    caption.style.color = '#a0a0a0';
    caption.style.marginBottom = '4px';
    caption.style.textTransform = 'uppercase';
    caption.style.letterSpacing = '0.04em';
    block.appendChild(caption);
    block.appendChild(field);
    return block;
  }

  /**
   * Creates a readonly monospace text field for the MCP URL.
   *
   * @param testId Data attribute value for tests.
   * @returns Input element.
   */
  private createReadonlyField(testId: string): HTMLInputElement {
    const field = document.createElement('input');
    field.type = 'text';
    field.readOnly = true;
    field.dataset['mcpField'] = testId;
    field.value = '—';
    field.style.width = '100%';
    field.style.boxSizing = 'border-box';
    field.style.padding = '8px 10px';
    field.style.borderRadius = '6px';
    field.style.border = '1px solid rgba(255,255,255,0.12)';
    field.style.background = 'rgba(0,0,0,0.35)';
    field.style.color = '#e8e8e8';
    field.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    field.style.fontSize = '12px';
    field.addEventListener('focus', () => field.select());
    return field;
  }

  /**
   * Creates the action button row.
   *
   * @returns Button row container.
   */
  private createButtonRow(): HTMLElement {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'flex-end';
    row.style.gap = '8px';
    row.appendChild(this.createSecondaryButton('Copy URL', () => void this.copyUrl()));
    row.appendChild(this.createPrimaryToggleButton());
    row.appendChild(this.createSecondaryButton('Close', () => this.close(), true));
    return row;
  }

  /**
   * Creates the Start/Stop primary button.
   *
   * @returns Primary button element.
   */
  private createPrimaryToggleButton(): HTMLButtonElement {
    this.primaryButton.type = 'button';
    this.primaryButton.textContent = 'Start server';
    this.styleActionButton(this.primaryButton, true);
    this.primaryButton.addEventListener('click', () => {
      void this.onPrimaryClicked();
    });
    return this.primaryButton;
  }

  /**
   * Creates a secondary dialog button.
   *
   * @param label Button text.
   * @param onClick Click handler.
   * @param isDefaultFocus Whether Escape-cancel focus should land here.
   * @returns Button element.
   */
  private createSecondaryButton(
    label: string,
    onClick: () => void,
    isDefaultFocus: boolean = false,
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    if (isDefaultFocus) button.dataset['messageBoxCancel'] = 'true';
    this.styleActionButton(button, false);
    button.addEventListener('click', onClick);
    return button;
  }

  /**
   * Applies message-box-like button styles.
   *
   * @param button Button element.
   * @param isPrimary Whether the button is the primary action.
   */
  private styleActionButton(button: HTMLButtonElement, isPrimary: boolean): void {
    button.style.padding = '7px 14px';
    button.style.borderRadius = '6px';
    button.style.fontSize = '13px';
    button.style.fontWeight = '600';
    button.style.cursor = 'pointer';
    button.style.border = isPrimary ? '1px solid rgba(232,106,23,0.65)' : '1px solid rgba(255,255,255,0.12)';
    button.style.background = isPrimary ? 'rgba(232,106,23,0.22)' : 'rgba(255,255,255,0.06)';
    button.style.color = isPrimary ? '#f0a060' : '#e0e0e0';
  }

  /** Loads host status into the dialog fields. */
  private async refreshStatus(): Promise<void> {
    if (!this.options.bridge) {
      this.applyDesktopOnlyState();
      return;
    }
    try {
      const status = await this.options.bridge.getMcpStatus();
      this.applyStatus(status);
    } catch {
      this.applyDesktopOnlyState();
      this.statusLine.textContent = 'Status: desktop RPC unavailable';
    }
  }

  /** Handles Start/Stop on the primary button. */
  private async onPrimaryClicked(): Promise<void> {
    if (!this.options.bridge) {
      this.options.showStatus('MCP is only available in the Electrobun desktop app');
      return;
    }
    if (this.running) {
      const status = await this.options.bridge.stopMcpServer();
      this.applyStatus(status);
      this.options.showStatus('MCP server stopped');
      return;
    }
    const result = await this.options.bridge.startMcpServer();
    this.applyStatus(result.status);
    this.options.showStatus(result.message);
  }

  /**
   * Updates fields from a host status snapshot.
   *
   * @param status Host status.
   */
  private applyStatus(status: McpHostStatus): void {
    this.running = status.running;
    this.primaryButton.disabled = false;
    this.primaryButton.textContent = status.running ? 'Stop server' : 'Start server';
    this.notifyRunningChanged(status.running);
    if (status.running && status.url) {
      this.statusLine.textContent = `Status: running on port ${status.port ?? '—'}`;
      this.urlField.value = status.url.trim();
      return;
    }
    this.statusLine.textContent = 'Status: stopped';
    this.urlField.value = '—';
  }

  /** Shows the desktop-only disabled state. */
  private applyDesktopOnlyState(): void {
    this.running = false;
    this.primaryButton.textContent = 'Desktop only';
    this.primaryButton.disabled = true;
    this.statusLine.textContent = 'Status: unavailable in the browser build';
    this.urlField.value = '—';
    this.notifyRunningChanged(false);
  }

  /**
   * Notifies the host UI when MCP running state changes.
   *
   * @param running Whether the MCP host is running.
   */
  private notifyRunningChanged(running: boolean): void {
    this.options.onRunningChanged?.(running);
  }

  /** Copies the MCP URL for AI client config. */
  private async copyUrl(): Promise<void> {
    const url = this.urlField.value.trim();
    if (!url || url === '—') {
      this.options.showStatus('Start the MCP server before copying the URL');
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      this.options.showStatus('MCP URL copied');
    } catch {
      this.options.showStatus('Could not copy MCP URL');
    }
  }
}
