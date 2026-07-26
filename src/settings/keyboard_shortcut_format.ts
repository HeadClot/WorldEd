import type { KeyboardShortcut } from './settings_types.js';

/**
 * Converts a shortcut binding to a short UI label such as "Ctrl+Shift+E".
 *
 * @param shortcut Configured key and modifiers.
 * @returns User-facing shortcut label.
 */
export function formatKeyboardShortcut(shortcut: KeyboardShortcut): string {
  const modifiers = [
    shortcut.ctrl ? 'Ctrl' : '',
    shortcut.shift ? 'Shift' : '',
    shortcut.alt ? 'Alt' : '',
    shortcut.meta ? 'Meta' : '',
  ].filter(Boolean);
  return [...modifiers, formatKeyboardCode(shortcut.code)].join('+');
}

/**
 * Converts a KeyboardEvent.code value to a short UI label.
 *
 * @param code Keyboard event code.
 * @returns User-facing key label.
 */
export function formatKeyboardCode(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Delete') return 'Del';
  if (code === 'Escape') return 'Esc';
  return code;
}
