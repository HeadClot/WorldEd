import { Theme } from '@/theme.js';
import { hexToRgb } from '@/utils/utils_color.js';

/**
 * Applies panel chrome styles for the progress dialog.
 *
 * @param panel Panel element.
 */
export function applyImportOverlayPanelStyles(panel: HTMLElement): void {
  panel.style.minWidth = '320px';
  panel.style.maxWidth = '420px';
  panel.style.padding = '20px 24px';
  panel.style.borderRadius = '8px';
  panel.style.background = hexToRgb(Theme.propertiesPanelBackground);
  panel.style.border = `1px solid ${hexToRgb(Theme.separatorColor)}`;
  panel.style.boxShadow = '0 8px 32px rgba(0,0,0,0.45)';
  panel.style.boxSizing = 'border-box';
  panel.style.fontFamily = 'system-ui, sans-serif';
}

/**
 * Applies title text styles.
 *
 * @param titleEl Title element.
 * @param title Heading text.
 */
export function applyImportOverlayTitleStyles(titleEl: HTMLElement, title: string): void {
  titleEl.textContent = title;
  titleEl.style.color = Theme.buttonTextColor;
  titleEl.style.fontSize = '15px';
  titleEl.style.fontWeight = '600';
  titleEl.style.marginBottom = '8px';
}

/**
 * Applies status label styles.
 *
 * @param labelEl Label element.
 */
export function applyImportOverlayLabelStyles(labelEl: HTMLElement): void {
  labelEl.textContent = 'Starting…';
  labelEl.style.color = Theme.statusBarTextColor;
  labelEl.style.fontSize = '12px';
  labelEl.style.marginBottom = '14px';
  labelEl.style.minHeight = '1.2em';
}

/**
 * Builds the progress track and fill elements.
 *
 * @param barFill Fill element owned by the overlay.
 * @returns Track element containing the fill.
 */
export function buildImportOverlayTrack(barFill: HTMLElement): HTMLElement {
  const track = document.createElement('div');
  track.style.height = '10px';
  track.style.borderRadius = '5px';
  track.style.background = hexToRgb(Theme.separatorColor);
  track.style.overflow = 'hidden';
  barFill.style.height = '100%';
  barFill.style.width = '0%';
  barFill.style.borderRadius = '5px';
  barFill.style.background = hexToRgb(Theme.selectionColor);
  barFill.style.transition = 'width 0.08s linear';
  track.appendChild(barFill);
  return track;
}

/**
 * Applies percent text styles.
 *
 * @param percentEl Percent label element.
 */
export function applyImportOverlayPercentStyles(percentEl: HTMLElement): void {
  percentEl.textContent = '0%';
  percentEl.style.color = Theme.statusBarTextColor;
  percentEl.style.fontSize = '11px';
  percentEl.style.marginTop = '8px';
  percentEl.style.textAlign = 'right';
}
