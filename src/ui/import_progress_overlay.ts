import { Theme } from '../theme.js';
import { hexToRgb } from '../utils/color_utils.js';

/**
 * Full-screen modal with a left-to-right progress bar for long imports.
 * Designed to update between async yields so the browser stays responsive.
 */
export class ImportProgressOverlay {
  private readonly root: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly labelEl: HTMLElement;
  private readonly barFill: HTMLElement;
  private readonly percentEl: HTMLElement;
  private mounted = false;

  /**
   * Creates an unmounted progress overlay.
   * @param title Heading text (e.g. "Importing VMF").
   */
  constructor(title: string = 'Importing…') {
    this.root = document.createElement('div');
    this.titleEl = document.createElement('div');
    this.labelEl = document.createElement('div');
    this.barFill = document.createElement('div');
    this.percentEl = document.createElement('div');
    this.buildDom(title);
  }

  /**
   * Appends the overlay to document.body if not already mounted.
   */
  show(): void {
    if (this.mounted) return;
    document.body.appendChild(this.root);
    this.mounted = true;
  }

  /**
   * Updates the bar and caption.
   * @param ratio Progress in 0..1.
   * @param label Optional status line under the title.
   */
  setProgress(ratio: number, label?: string): void {
    const clamped = Math.max(0, Math.min(1, ratio));
    const percent = Math.round(clamped * 100);
    this.barFill.style.width = `${percent}%`;
    this.percentEl.textContent = `${percent}%`;
    if (label !== undefined) {
      this.labelEl.textContent = label;
    }
  }

  /**
   * Removes the overlay from the document.
   */
  hide(): void {
    if (!this.mounted) return;
    if (this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
    }
    this.mounted = false;
  }

  /**
   * Builds overlay DOM structure and styles.
   * @param title Heading text.
   */
  private buildDom(title: string): void {
    this.root.style.position = 'fixed';
    this.root.style.inset = '0';
    this.root.style.zIndex = '10000';
    this.root.style.display = 'flex';
    this.root.style.alignItems = 'center';
    this.root.style.justifyContent = 'center';
    this.root.style.background = 'rgba(0, 0, 0, 0.55)';
    this.root.style.fontFamily = 'system-ui, sans-serif';

    const panel = document.createElement('div');
    panel.style.minWidth = '320px';
    panel.style.maxWidth = '420px';
    panel.style.padding = '20px 24px';
    panel.style.borderRadius = '8px';
    panel.style.background = hexToRgb(Theme.propertiesPanelBackground);
    panel.style.border = `1px solid ${hexToRgb(Theme.separatorColor)}`;
    panel.style.boxShadow = '0 8px 32px rgba(0,0,0,0.45)';

    this.titleEl.textContent = title;
    this.titleEl.style.color = Theme.buttonTextColor;
    this.titleEl.style.fontSize = '15px';
    this.titleEl.style.fontWeight = '600';
    this.titleEl.style.marginBottom = '8px';

    this.labelEl.textContent = 'Starting…';
    this.labelEl.style.color = Theme.statusBarTextColor;
    this.labelEl.style.fontSize = '12px';
    this.labelEl.style.marginBottom = '14px';
    this.labelEl.style.minHeight = '1.2em';

    const track = document.createElement('div');
    track.style.height = '10px';
    track.style.borderRadius = '5px';
    track.style.background = hexToRgb(Theme.separatorColor);
    track.style.overflow = 'hidden';

    this.barFill.style.height = '100%';
    this.barFill.style.width = '0%';
    this.barFill.style.borderRadius = '5px';
    this.barFill.style.background = hexToRgb(Theme.selectionColor);
    this.barFill.style.transition = 'width 0.08s linear';
    track.appendChild(this.barFill);

    this.percentEl.textContent = '0%';
    this.percentEl.style.color = Theme.statusBarTextColor;
    this.percentEl.style.fontSize = '11px';
    this.percentEl.style.marginTop = '8px';
    this.percentEl.style.textAlign = 'right';

    panel.appendChild(this.titleEl);
    panel.appendChild(this.labelEl);
    panel.appendChild(track);
    panel.appendChild(this.percentEl);
    this.root.appendChild(panel);
  }
}
