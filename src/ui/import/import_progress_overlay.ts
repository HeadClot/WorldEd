import {
  applyImportOverlayLabelStyles,
  applyImportOverlayPanelStyles,
  applyImportOverlayPercentStyles,
  applyImportOverlayTitleStyles,
  buildImportOverlayTrack,
} from './import_progress_overlay_styles.js';
import { PanelFloating } from '@/ui/floating_panel/panel_floating.js';

/**
 * Modal progress dialog with a left-to-right bar for long imports. Windowing
 * comes from {@link PanelFloating}.
 */
export class ImportProgressOverlay extends PanelFloating {
  private readonly titleEl: HTMLElement;
  private readonly labelEl: HTMLElement;
  private readonly barFill: HTMLElement;
  private readonly percentEl: HTMLElement;

  /**
   * Creates an unopened progress overlay under document.body.
   *
   * @param title Heading text (e.g. "Importing VMF").
   */
  constructor(title: string = 'Importing…') {
    super(document.body, {
      corner: 'top-left',
      modal: true,
      centered: true,
      draggable: false,
      closeOnEscape: false,
      closeOnBackdropClick: false,
      stackLayer: 'modal',
      backdropClassName: 'editor-import-progress-backdrop',
    });
    this.titleEl = document.createElement('div');
    this.labelEl = document.createElement('div');
    this.barFill = document.createElement('div');
    this.percentEl = document.createElement('div');
    this.buildDom(title);
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

  /**
   * Builds overlay panel chrome inside the floating shell.
   *
   * @param title Heading text.
   */
  private buildDom(title: string): void {
    applyImportOverlayPanelStyles(this.root);
    this.root.style.display = 'none';
    applyImportOverlayTitleStyles(this.titleEl, title);
    applyImportOverlayLabelStyles(this.labelEl);
    const track = buildImportOverlayTrack(this.barFill);
    applyImportOverlayPercentStyles(this.percentEl);
    this.root.appendChild(this.titleEl);
    this.root.appendChild(this.labelEl);
    this.root.appendChild(track);
    this.root.appendChild(this.percentEl);
  }
}
