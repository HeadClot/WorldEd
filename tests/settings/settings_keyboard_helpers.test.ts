import { describe, expect, it } from 'vitest';
import { createDefaultKeyboardShortcutSettings } from '../../src/settings/settings_defaults.js';
import {
  areShortcutsEqual,
  isValidKeyboardShortcut,
  mergeKeyboardShortcutSettings,
  sanitizeKeyboardShortcut,
} from '../../src/settings/settings_keyboard_helpers.js';

describe('settings_keyboard_helpers', () => {
  it('validates complete shortcut objects', () => {
    const valid = { code: 'KeyA', ctrl: true, shift: false, alt: false, meta: false };
    expect(isValidKeyboardShortcut(valid)).toBe(true);
    expect(isValidKeyboardShortcut({ code: 'KeyA' })).toBe(false);
  });

  it('sanitizes partial or string shortcut storage forms', () => {
    const fallback = { code: 'KeyW', ctrl: false, shift: false, alt: false, meta: false };
    expect(sanitizeKeyboardShortcut('KeyQ', fallback)).toEqual({ ...fallback, code: 'KeyQ' });
    expect(sanitizeKeyboardShortcut(null, fallback)).toEqual(fallback);
  });

  it('merges every action from a partial keyboard settings map', () => {
    const defaults = createDefaultKeyboardShortcutSettings();
    const customMove = { code: 'KeyZ', ctrl: false, shift: false, alt: false, meta: false };
    const merged = mergeKeyboardShortcutSettings(defaults, { move: customMove });
    expect(merged.move).toEqual(customMove);
    expect(merged.rotate).toEqual(defaults.rotate);
    expect(areShortcutsEqual(merged.rotate, defaults.rotate)).toBe(true);
  });
});
