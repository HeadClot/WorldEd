import type { ToolbarMenuEntry } from '@/ui/menu/menu_types.js';
import { EditorInteractionMode, getEditorInteractionModeLabel } from '@/types/editor_interaction_mode.js';

/**
 * Builds Object Mode / Edit Mode entries for the shared menu panel.
 *
 * @param activeMode Currently active interaction mode.
 * @param onSelect Invoked when the user chooses a mode.
 * @returns Menu entries for PanelMenu.
 */
export function buildViewportToolModeMenuEntries(
  activeMode: EditorInteractionMode,
  onSelect: (mode: EditorInteractionMode) => void,
): ToolbarMenuEntry[] {
  return [
    createModeMenuEntry(EditorInteractionMode.OBJECT_MODE, activeMode, onSelect),
    createModeMenuEntry(EditorInteractionMode.EDIT_MODE, activeMode, onSelect),
  ];
}

/**
 * Builds one mode action row with an active checkmark when selected.
 *
 * @param mode Mode for the row.
 * @param activeMode Currently active mode.
 * @param onSelect Selection callback.
 * @returns Menu action entry.
 */
function createModeMenuEntry(
  mode: EditorInteractionMode,
  activeMode: EditorInteractionMode,
  onSelect: (mode: EditorInteractionMode) => void,
): ToolbarMenuEntry {
  return {
    label: formatModeMenuLabel(mode, activeMode),
    shortcut: 'Tab',
    onClick: () => onSelect(mode),
  };
}

/**
 * Formats a mode label, marking the active selection.
 *
 * @param mode Menu mode.
 * @param activeMode Active interaction mode.
 * @returns Display label for the row.
 */
function formatModeMenuLabel(mode: EditorInteractionMode, activeMode: EditorInteractionMode): string {
  const label = getEditorInteractionModeLabel(mode);
  if (mode === activeMode) {
    return `✓ ${label}`;
  }
  return label;
}
