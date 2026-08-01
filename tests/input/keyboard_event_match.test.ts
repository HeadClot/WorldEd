import { describe, it, expect } from 'vitest';
import { keyboardEventMatchesCode, keyboardShortcutCodeFromEvent } from '@/input/keyboard_event_match.js';

/**
 * Builds a keyboard event with physical code and produced key.
 *
 * @param code Physical KeyboardEvent.code.
 * @param key Produced KeyboardEvent.key.
 * @returns Keyboard event.
 */
function keyEvent(code: string, key: string): KeyboardEvent {
  return new KeyboardEvent('keydown', { code, key });
}

describe('keyboard_event_match', () => {
  it('matches letter bindings by produced character for QWERTZ Y/Z swap', () => {
    const germanZ = keyEvent('KeyY', 'z');
    const germanY = keyEvent('KeyZ', 'y');
    expect(keyboardEventMatchesCode(germanZ, 'KeyZ')).toBe(true);
    expect(keyboardEventMatchesCode(germanZ, 'KeyY')).toBe(false);
    expect(keyboardEventMatchesCode(germanY, 'KeyY')).toBe(true);
    expect(keyboardEventMatchesCode(germanY, 'KeyZ')).toBe(false);
  });

  it('matches QWERTY letter bindings by character and code', () => {
    const usZ = keyEvent('KeyZ', 'z');
    expect(keyboardEventMatchesCode(usZ, 'KeyZ')).toBe(true);
    expect(keyboardEventMatchesCode(usZ, 'KeyY')).toBe(false);
  });

  it('stores layout-stable codes when capturing German Z', () => {
    const germanZ = keyEvent('KeyY', 'z');
    expect(keyboardShortcutCodeFromEvent(germanZ)).toBe('KeyZ');
  });

  it('keeps physical codes for Escape and function keys', () => {
    const escape = keyEvent('Escape', 'Escape');
    expect(keyboardEventMatchesCode(escape, 'Escape')).toBe(true);
    expect(keyboardShortcutCodeFromEvent(escape)).toBe('Escape');
  });

  it('matches digits by produced character', () => {
    const digit = keyEvent('Digit2', '2');
    expect(keyboardEventMatchesCode(digit, 'Digit2')).toBe(true);
    expect(keyboardShortcutCodeFromEvent(digit)).toBe('Digit2');
  });

  it('stores main-row Minus and NumpadSubtract as distinct codes', () => {
    expect(keyboardShortcutCodeFromEvent(keyEvent('Minus', '-'))).toBe('Minus');
    expect(keyboardShortcutCodeFromEvent(keyEvent('NumpadSubtract', '-'))).toBe('NumpadSubtract');
  });

  it('maps a produced hyphen to Minus when code is missing', () => {
    expect(keyboardShortcutCodeFromEvent(keyEvent('', '-'))).toBe('Minus');
  });
});
