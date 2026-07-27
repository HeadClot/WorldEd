import type { ToolbarMenuEntry } from './menu/menu_types.js';
import { VIEWPORT_KIND_MENU_ORDER, ViewportKind, getViewportKindDisplayLabel } from '../viewports/viewport_kind.js';

/**
 * Builds menu entries for switching a viewport pane kind.
 *
 * @param currentKind Currently active kind for the pane.
 * @param onSelect Invoked when the user chooses a kind.
 * @returns Menu entries for MenuPanel.
 */
export function buildViewportTypeMenuEntries(
  currentKind: ViewportKind,
  onSelect: (kind: ViewportKind) => void,
): ToolbarMenuEntry[] {
  return VIEWPORT_KIND_MENU_ORDER.map((kind) => ({
    label: formatKindMenuLabel(kind, currentKind),
    onClick: () => onSelect(kind),
  }));
}

/**
 * Formats a kind label, marking the active selection.
 *
 * @param kind Menu kind.
 * @param currentKind Active pane kind.
 * @returns Display label for the row.
 */
function formatKindMenuLabel(kind: ViewportKind, currentKind: ViewportKind): string {
  const label = getViewportKindDisplayLabel(kind);
  if (kind === currentKind) return `✓ ${label}`;
  return label;
}
