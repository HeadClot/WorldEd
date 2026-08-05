import { Theme } from '@/theme.js';
import { hexToRgb } from '@/utils/utils_color.js';

/**
 * Applies the shared options-bar control box (height, radius, font) used by
 * text actions, icon actions, and the mode dropdown trigger.
 *
 * @param element Control element to style.
 */
export function applyViewportToolOptionsControlBox(element: HTMLElement): void {
  const heightPx = Theme.viewportToolOptionsControlHeightPx;
  element.style.boxSizing = 'border-box';
  element.style.height = `${heightPx}px`;
  element.style.minHeight = `${heightPx}px`;
  element.style.maxHeight = `${heightPx}px`;
  element.style.borderRadius = '4px';
  element.style.fontFamily = Theme.uiFontFamily;
  element.style.fontSize = '11px';
  element.style.lineHeight = '1';
  element.style.cursor = 'pointer';
  element.style.flex = '0 0 auto';
}

/**
 * Applies compact icon-button metrics matching the viewport title toolbar.
 *
 * @param button Icon button element.
 */
export function applyViewportToolOptionsIconButtonMetrics(button: HTMLButtonElement): void {
  const sizePx = Theme.viewportToolOptionsControlHeightPx;
  applyViewportToolOptionsControlBox(button);
  button.style.width = `${sizePx}px`;
  button.style.minWidth = `${sizePx}px`;
  button.style.padding = '0';
  button.style.margin = '0';
  button.style.display = 'inline-flex';
  button.style.alignItems = 'center';
  button.style.justifyContent = 'center';
  button.style.color = Theme.buttonTextColor;
}

/**
 * Applies compact text-button metrics matching the options control height.
 *
 * @param button Text action button element.
 */
export function applyViewportToolOptionsTextButtonMetrics(button: HTMLButtonElement): void {
  applyViewportToolOptionsControlBox(button);
  button.style.display = 'inline-flex';
  button.style.alignItems = 'center';
  button.style.justifyContent = 'center';
  button.style.padding = '0 6px';
  button.style.margin = '0';
  button.style.border = `1px solid ${Theme.inputBorderColor}`;
  button.style.background = hexToRgb(Theme.buttonBackground);
  button.style.color = Theme.buttonTextColor;
  button.style.fontWeight = '500';
  button.style.whiteSpace = 'nowrap';
}
