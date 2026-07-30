import {
  applyImportOverlayLabelStyles,
  applyImportOverlayPanelStyles,
  applyImportOverlayPercentStyles,
  applyImportOverlayRootStyles,
  applyImportOverlayTitleStyles,
  buildImportOverlayTrack,
} from './import_progress_overlay_styles.js';

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
   *
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

  /** Appends the overlay to document.body if not already mounted. */
  show(): void {
    if (this.mounted) return;
    document.body.appendChild(this.root);
    this.mounted = true;
  }

  /**
   * Updates the bar and caption.
   *
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

  /** Removes the overlay from the document. */
  hide(): void {
    if (!this.mounted) return;
    if (this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
    }
    this.mounted = false;
  }

  /**
   * Builds overlay DOM structure and styles.
   *
   * @param title Heading text.
   */
  private buildDom(title: string): void {
    applyImportOverlayRootStyles(this.root);
    const panel = document.createElement('div');
    applyImportOverlayPanelStyles(panel);
    applyImportOverlayTitleStyles(this.titleEl, title);
    applyImportOverlayLabelStyles(this.labelEl);
    const track = buildImportOverlayTrack(this.barFill);
    applyImportOverlayPercentStyles(this.percentEl);
    panel.appendChild(this.titleEl);
    panel.appendChild(this.labelEl);
    panel.appendChild(track);
    panel.appendChild(this.percentEl);
    this.root.appendChild(panel);
  }
}
