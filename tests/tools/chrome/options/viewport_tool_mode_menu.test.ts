import { describe, it, expect } from 'vitest';
import { buildViewportToolModeMenuEntries } from '@/tools/chrome/options/viewport_tool_mode_menu.js';
import { EditorInteractionMode } from '@/types/editor_interaction_mode.js';
import { isMenuAction } from '@/ui/menu/menu_types.js';

describe('buildViewportToolModeMenuEntries', () => {
  it('lists Object Mode and Edit Mode with Tab shortcut', () => {
    const entries = buildViewportToolModeMenuEntries(EditorInteractionMode.OBJECT_MODE, () => undefined);
    expect(entries).toHaveLength(2);
    const labels = entries.filter(isMenuAction).map((entry) => entry.label);
    expect(labels[0]).toContain('Object Mode');
    expect(labels[1]).toContain('Edit Mode');
    expect(entries.filter(isMenuAction).every((entry) => entry.shortcut === 'Tab')).toBe(true);
  });

  it('marks the active mode with a checkmark', () => {
    const entries = buildViewportToolModeMenuEntries(EditorInteractionMode.EDIT_MODE, () => undefined);
    const actions = entries.filter(isMenuAction);
    expect(actions[0]!.label.startsWith('✓')).toBe(false);
    expect(actions[1]!.label.startsWith('✓')).toBe(true);
  });
});
