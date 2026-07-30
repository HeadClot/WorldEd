import { describe, expect, it } from 'vitest';
import { formatKeyboardCode, formatKeyboardShortcut } from '@/settings/keyboard/keyboard_shortcut_format.js';

describe('keyboard_shortcut_format', () => {
  it('formats modifier combinations for menu display', () => {
    expect(
      formatKeyboardShortcut({
        code: 'KeyS',
        ctrl: true,
        shift: false,
        alt: false,
        meta: false,
      }),
    ).toBe('Ctrl+S');
    expect(
      formatKeyboardShortcut({
        code: 'KeyE',
        ctrl: true,
        shift: true,
        alt: false,
        meta: false,
      }),
    ).toBe('Ctrl+Shift+E');
  });

  it('formats common key codes into short labels', () => {
    expect(formatKeyboardCode('KeyA')).toBe('A');
    expect(formatKeyboardCode('Digit3')).toBe('3');
    expect(formatKeyboardCode('Delete')).toBe('Del');
    expect(formatKeyboardCode('Escape')).toBe('Esc');
  });
});
